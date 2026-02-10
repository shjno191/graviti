
use std::collections::{HashMap, HashSet};
use tree_sitter::{Parser, Node};

#[derive(Debug, Clone, serde::Serialize)]
pub struct MethodNode {
    pub name: String,
    // Start/End byte offsets for mapping back to source
    pub range: (usize, usize), 
    pub modifiers: Vec<String>,
    pub return_type: String,
}

#[derive(Debug, serde::Serialize)]
pub struct CallGraph {
    // Map of Method Name -> Method Details
    pub nodes: HashMap<String, MethodNode>,
    // Adjacency List: Caller -> List of Callees (in order of appearance)
    pub calls: HashMap<String, Vec<String>>,
}

// --- Configuration and API structs ---

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FlowSettings {
    pub ignored_variables: Vec<String>,
    pub ignored_services: Vec<String>,
    pub collapse_details: bool,
}

impl Default for FlowSettings {
    fn default() -> Self {
        FlowSettings {
            ignored_variables: vec![],
            ignored_services: vec!["System.out".to_string(), "System.err".to_string()],
            collapse_details: false,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MermaidOptions {
    pub session_ignore_services: Vec<String>,
    pub collapse_details: bool,
}

impl Default for MermaidOptions {
    fn default() -> Self {
        MermaidOptions {
            session_ignore_services: vec![],
            collapse_details: false,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MermaidResult {
    pub mermaid: String,
    pub external_services: Vec<String>,
}

pub struct JavaParser;

impl JavaParser {
    pub fn parse(source: &str) -> Result<CallGraph, String> {
        let mut parser = Parser::new();
        parser.set_language(tree_sitter_java::language()).map_err(|e| e.to_string())?;
        
        let tree = parser.parse(source, None).ok_or("Failed to parse source")?;
        let root_node = tree.root_node();

        let mut methods = HashMap::new();
        let mut method_calls = HashMap::new();

        // Pass 1: Collect all method declarations
        let mut method_declarations = Vec::new(); // Store nodes to process later

        Self::collect_method_declarations(root_node, source, &mut methods, &mut method_declarations);

        let method_names: HashSet<String> = methods.keys().cloned().collect();

        // Pass 2: Analyze method bodies for calls
        for (name, node) in &method_declarations {
             let calls = Self::find_calls(*node, source, &method_names);
             method_calls.insert(name.clone(), calls);
        }

        Ok(CallGraph {
            nodes: methods,
            calls: method_calls,
        })
    }

    fn collect_method_declarations<'a>(
        node: Node<'a>, 
        source: &str, 
        methods: &mut HashMap<String, MethodNode>,
        declarations: &mut Vec<(String, Node<'a>)>
    ) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "method_declaration" {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = &source[name_node.byte_range().start..name_node.byte_range().end].trim();
                    
                    
                    // Extract modifiers
                    let mut modifiers = Vec::new();
                    
                    let mut modifiers_node = child.child_by_field_name("modifiers");
                    if modifiers_node.is_none() {
                         let mut c = child.walk();
                         modifiers_node = child.children(&mut c).find(|x| x.kind() == "modifiers");
                    }

                    if let Some(modifiers_node) = modifiers_node {
                        // eprintln!("Modifiers node text: {}", &source[modifiers_node.start_byte()..modifiers_node.end_byte()]);
                        
                        let mut mod_cursor = modifiers_node.walk();
                        for mod_child in modifiers_node.children(&mut mod_cursor) {
                            let mod_text = &source[mod_child.byte_range().start..mod_child.byte_range().end].trim().to_string();
                            // eprintln!("  Modifier child kind: {}, Text: {}", mod_child.kind(), mod_text);
                            modifiers.push(mod_text.to_string());
                        }
                        
                        // Fallback: if no children (maybe it's a single token?), take the whole text
                        if modifiers.is_empty() {
                             let node_text = &source[modifiers_node.byte_range().start..modifiers_node.byte_range().end].trim();
                             // eprintln!("  Modifiers fallback Text: {}", node_text);
                             modifiers.push(node_text.to_string());
                        }
                    }
                    
                    let return_type = match child.child_by_field_name("type") {
                        Some(t) => source[t.byte_range().start..t.byte_range().end].trim().to_string(),
                        None => "".to_string(), // Probably a constructor
                    };
                    
                    let method_node = MethodNode {
                        name: name.to_string(),
                        range: (child.byte_range().start, child.byte_range().end),
                        modifiers,
                        return_type,
                    };
                    methods.insert(name.to_string(), method_node);
                    declarations.push((name.to_string(), child));
                }
            } else if child.kind() == "class_declaration" {
                // Recurse into nested classes if needed (though requirement says "same class")
                // For now, let's just recurse to find methods inside the main class body
                 Self::collect_method_declarations(child, source, methods, declarations);
            } else if child.kind() == "class_body" {
                 Self::collect_method_declarations(child, source, methods, declarations);
            }
        }
    }

    fn find_calls(node: Node, source: &str, valid_methods: &HashSet<String>) -> Vec<String> {
        let mut calls = Vec::new();        
        // We only care about the body, which is usually a 'block'
        if let Some(body) = node.child_by_field_name("body") {
            Self::visit_body(body, source, valid_methods, &mut calls);
        }
        
        calls
    }

    fn visit_body(node: Node, source: &str, valid_methods: &HashSet<String>, calls: &mut Vec<String>) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "method_invocation" {
                // Check if it's a local call
                // Simple case: name() -> identifier
                // Complex case: this.name() -> field_access
                
                let name_node = child.child_by_field_name("name");
                 if let Some(name_node) = name_node {
                     let name = &source[name_node.byte_range().start..name_node.byte_range().end];
                     
                     // Check if there is an object/expression before the name (e.g., obj.method())
                     let object_node = child.child_by_field_name("object");
                     
                     let is_local_call = match object_node {
                         None => true, // direct call: method()
                         Some(obj) => {
                             let obj_text = &source[obj.byte_range().start..obj.byte_range().end];
                             obj_text == "this" // explicit local call: this.method()
                         }
                     };

                     if is_local_call && valid_methods.contains(name) {
                         calls.push(name.to_string());
                     }
                 }
                 // Continue searching arguments for nested calls: methodA(methodB())
                 if let Some(args) = child.child_by_field_name("arguments") {
                      Self::visit_body(args, source, valid_methods, calls);
                 }

            } else {
                // Recurse into blocks, if statements, loops, etc.
                if child.child_count() > 0 {
                    Self::visit_body(child, source, valid_methods, calls);
                }
            }
        }
    }

    pub fn generate_mermaid(graph: &CallGraph, source: &str, method_name: Option<String>) -> String {
        let mut output = String::from("flowchart TD\n");
        
        let mut target_methods: Vec<String> = Vec::new();

        if let Some(name) = method_name {
            if graph.nodes.contains_key(&name) {
                target_methods.push(name);
            }
        } else {
            // Default: Public AND Protected methods
            target_methods = graph.nodes.iter()
                .filter(|(_, node)| {
                    node.modifiers.contains(&"public".to_string()) || 
                    node.modifiers.contains(&"protected".to_string())
                })
                .map(|(name, _)| name.clone())
                .collect();
            target_methods.sort();
        }

        // We need a fresh parser to traverse bodies for Control Flow logic
        let mut parser = Parser::new();
        if parser.set_language(tree_sitter_java::language()).is_err() {
            return "error: failed to set language".to_string();
        }
        let tree = match parser.parse(source, None) {
             Some(t) => t,
             None => return "error: parse failed".to_string(),
        };
        let root_node = tree.root_node();

        // We need to map method names to their nodes to start traversal
        // We can reuse graph.nodes.range to find the node in the new tree? 
        // Or just re-find them. Using graph.nodes.range is safer/faster.
        
        let default_ignored_vars: Vec<String> = vec![];
        let default_ignored_svcs: Vec<String> = vec!["System.out".to_string(), "System.err".to_string()];

        let mut generator = FlowGenerator {
            source,
            graph,
            output: &mut output,
            node_counter: 0,
            ignored_variables: &default_ignored_vars,
            ignored_services: &default_ignored_svcs,
            collapse_details: false,
            detected_externals: HashSet::new(),
        };

        for method_name in target_methods {
             if let Some(node_info) = graph.nodes.get(&method_name) {
                 let start_byte = node_info.range.0;
                 let end_byte = node_info.range.1;
                 if let Some(method_node) = Self::find_node_by_range(root_node, start_byte, end_byte) {
                      generator.generate_method_flow(method_node, &method_name);
                 }
             }
        }

        // Styles
        output.push_str("  classDef public fill:#f9f,stroke:#333,stroke-width:2px;\n");
        output.push_str("  classDef internal fill:#e1f5fe,stroke:#01579b,stroke-width:1px;\n");
        output.push_str("  classDef external fill:#ffe0b2,stroke:#e65100,stroke-width:1px,stroke-dasharray: 5 5;\n");
        output.push_str("  classDef decision fill:#fff9c4,stroke:#fbc02d,stroke-width:1px,shape:rhombus;\n");
        output.push_str("  classDef loop fill:#e8f5e9,stroke:#2e7d32,stroke-width:1px;\n");
        output.push_str("  classDef endNode fill:#fce4ec,stroke:#c62828,stroke-width:2px;\n");

        output
    }

    pub fn generate_mermaid_filtered(
        graph: &CallGraph,
        source: &str,
        method_name: Option<String>,
        ignored_variables: &[String],
        ignored_services: &[String],
        collapse_details: bool,
    ) -> MermaidResult {
        let mut output = String::from("flowchart TD\n");

        let mut target_methods: Vec<String> = Vec::new();

        if let Some(ref name) = method_name {
            if graph.nodes.contains_key(name) {
                target_methods.push(name.clone());
            }
        } else {
            target_methods = graph.nodes.iter()
                .filter(|(_, node)| {
                    node.modifiers.contains(&"public".to_string()) ||
                    node.modifiers.contains(&"protected".to_string())
                })
                .map(|(name, _)| name.clone())
                .collect();
            target_methods.sort();
        }

        let mut parser = Parser::new();
        if parser.set_language(tree_sitter_java::language()).is_err() {
            return MermaidResult {
                mermaid: "error: failed to set language".to_string(),
                external_services: vec![],
            };
        }
        let tree = match parser.parse(source, None) {
            Some(t) => t,
            None => return MermaidResult {
                mermaid: "error: parse failed".to_string(),
                external_services: vec![],
            },
        };
        let root_node = tree.root_node();

        let mut generator = FlowGenerator {
            source,
            graph,
            output: &mut output,
            node_counter: 0,
            ignored_variables,
            ignored_services,
            collapse_details,
            detected_externals: HashSet::new(),
        };

        // Collapse mode with no specific method: render a simplified overview
        if collapse_details && method_name.is_none() {
            for method_name in &target_methods {
                let node_id = generator.next_id();
                generator.output.push_str(&format!("    {}([\"{}\"]):::public\n", node_id, method_name));
            }
            // Add edges based on call graph
            // (simplified: just show who calls whom)
        } else {
            for method_name in &target_methods {
                if let Some(node_info) = graph.nodes.get(method_name) {
                    let start_byte = node_info.range.0;
                    let end_byte = node_info.range.1;
                    if let Some(method_node) = Self::find_node_by_range(root_node, start_byte, end_byte) {
                        generator.generate_method_flow(method_node, method_name);
                    }
                }
            }
        }

        let external_services: Vec<String> = generator.detected_externals.into_iter().collect();

        // Styles
        output.push_str("  classDef public fill:#f9f,stroke:#333,stroke-width:2px;\n");
        output.push_str("  classDef internal fill:#e1f5fe,stroke:#01579b,stroke-width:1px;\n");
        output.push_str("  classDef external fill:#ffe0b2,stroke:#e65100,stroke-width:1px,stroke-dasharray: 5 5;\n");
        output.push_str("  classDef decision fill:#fff9c4,stroke:#fbc02d,stroke-width:1px,shape:rhombus;\n");
        output.push_str("  classDef loop fill:#e8f5e9,stroke:#2e7d32,stroke-width:1px;\n");
        output.push_str("  classDef endNode fill:#fce4ec,stroke:#c62828,stroke-width:2px;\n");

        MermaidResult {
            mermaid: output,
            external_services,
        }
    }

    fn find_node_by_range<'a>(root: Node<'a>, start: usize, end: usize) -> Option<Node<'a>> {        // Traverse to find the specific node. behavior of `goto_first_child_for_byte` might help but exact match is needed.
        // Since we know the bytes, we can try to locate it.
        // Actually, just walking declarations again is robust enough given we have structure.
        // But for optimization, let's just do a named child search or standard walk.
        
        // Optimization: Recursive search check bounds
        Self::find_node_recursive(root, start, end)
    }
    
    fn find_node_recursive<'a>(node: Node<'a>, start: usize, end: usize) -> Option<Node<'a>> {
        if node.byte_range().start == start && node.byte_range().end == end {
            return Some(node);
        }
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
             if child.byte_range().end > start && child.byte_range().start < end {
                 if let Some(found) = Self::find_node_recursive(child, start, end) {
                     return Some(found);
                 }
             }
        }
        None
    }
}

#[allow(dead_code)]
struct FlowGenerator<'a> {
    source: &'a str,
    graph: &'a CallGraph,
    output: &'a mut String,
    node_counter: usize,
    ignored_variables: &'a [String],
    ignored_services: &'a [String],
    collapse_details: bool,
    detected_externals: HashSet<String>,
}

impl<'a> FlowGenerator<'a> {
    fn next_id(&mut self) -> String {
        self.node_counter += 1;
        format!("N{}", self.node_counter)
    }

    fn generate_method_flow(&mut self, method_node: Node, method_name: &str) {
        self.output.push_str(&format!("  subgraph {}\n", method_name));
        self.output.push_str("    direction TB\n");
        
        let start_id = self.next_id();
        self.output.push_str(&format!("    {}([\"{}\"]):::public\n", start_id, method_name));

        if let Some(body) = method_node.child_by_field_name("body") {
            let end_nodes = self.traverse_block(body, vec![start_id]);
            let end_id = self.next_id();
            for prev in end_nodes {
                self.output.push_str(&format!("    {} --> {}\n", prev, end_id));
            }
            self.output.push_str(&format!("    {}([\"End of {}\"]):::endNode\n", end_id, method_name));
        }
        
        self.output.push_str("  end\n");
    }

    fn traverse_block(&mut self, block_node: Node, mut prev_ids: Vec<String>) -> Vec<String> {
        let mut cursor = block_node.walk();
        let children: Vec<Node> = block_node.children(&mut cursor).collect();
        
        for child in children {
             if !child.is_named() { continue; }
             let next_ids = self.dispatch_node(child, prev_ids.clone(), None);
             if next_ids != prev_ids {
                 prev_ids = next_ids;
             }
        }
        prev_ids
    }

    fn traverse_node_with_label(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        let mut current_ids = prev_ids;
        let mut current_label = label;
        
        if node.kind() == "block" {
             let mut cursor = node.walk();
             let children: Vec<Node> = node.children(&mut cursor).collect();
             
             // If block is empty, we must just return current_ids but handle proper flow? 
             // If empty block, we effectively "passed through".
             // But we need to verify if label was consumed?
             // If label supplied but no nodes generated, the label is lost unless propagated.
             // For now, if block empty, return prevs. Label effectively points to "End of Block"?
             
             for child in children {
                 if !child.is_named() { continue; }
                 
                 let next_ids = self.dispatch_node(child, current_ids.clone(), current_label.clone());
                 
                 if next_ids != current_ids {
                      current_label = None; // Consumed
                      current_ids = next_ids;
                 }
             }
             return current_ids;
        } else {
            return self.dispatch_node(node, current_ids, current_label);
        }
    }
    
    fn dispatch_node(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
         match node.kind() {
             "expression_statement" | "local_variable_declaration" | "return_statement" => {
                 self.process_expression_with_label(node, prev_ids, label)
             },
             "if_statement" => {
                 self.process_if_with_label(node, prev_ids, label)
             },
             "for_statement" | "while_statement" | "do_statement" | "enhanced_for_statement" => {
                 self.process_loop_with_label(node, prev_ids, label)
             },
             "switch_expression" | "switch_statement" => {
                 self.process_switch_with_label(node, prev_ids, label)
             },
              _ => {
                  self.process_generic_recursive_with_label(node, prev_ids, label)
              }
         }
    }

    fn process_expression_with_label(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        let calls = self.find_calls_in_node(node);
        let is_return = node.kind() == "return_statement";
        
        if calls.is_empty() && !is_return {
            return prev_ids;
        }

        let mut current_prevs = prev_ids;
        let mut pending_label = label;
         
        for (name, is_external, raw_text, offset) in calls {
             let node_id = self.next_id();
             let text_label = if is_external { format!("External: {}", raw_text) } else { name.clone() };
             let style = if is_external { "external" } else { "internal" };
             
             let safe_label = text_label.replace('"', "'");
             self.output.push_str(&format!("    {}[\"{}\"]:::{}\n", node_id, safe_label, style));
             
             // Add click action
             self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\") \"Scroll to source\"\n", node_id, offset));

             for prev in &current_prevs {
                 let arrow = match &pending_label {
                     Some(l) => format!("-->|{}|", l),
                     None => "-->".to_string()
                 };
                 self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
             }
             
             pending_label = None;
             current_prevs = vec![node_id];
         }
         
         if is_return {
             let node_id = self.next_id();
             let return_text = &self.source[node.byte_range().start..node.byte_range().end].replace('"', "'");
             self.output.push_str(&format!("    {}[\"{}\"]\n", node_id, return_text));
             
             // Add click action
             let offset = node.byte_range().start;
             self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\") \"Scroll to source\"\n", node_id, offset));

             for prev in &current_prevs {
                 let arrow = match &pending_label {
                     Some(l) => format!("-->|{}|", l),
                     None => "-->".to_string()
                 };
                 self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
             }
             current_prevs = vec![node_id]; 
         }
         
         current_prevs
    }

    fn process_if_with_label(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        let condition_node = node.child_by_field_name("condition").unwrap();
        let cond_calls = self.find_calls_in_node(condition_node);
        let mut current_prevs = prev_ids;
        let mut pending_label = label;

        for (name, is_external, raw_text, offset) in cond_calls {
             let node_id = self.next_id();
             let text_label = if is_external { format!("External: {}", raw_text) } else { name.clone() };
             let style = if is_external { "external" } else { "internal" };
             let safe_label = text_label.replace('"', "'");
             self.output.push_str(&format!("    {}[\"{}\"]:::{}\n", node_id, safe_label, style));
             
             // Add click action
             self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\") \"Scroll to source\"\n", node_id, offset));

             for prev in &current_prevs {
                 let arrow = match &pending_label {
                     Some(l) => format!("-->|{}|", l),
                     None => "-->".to_string()
                 };
                 self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
             }
             
             pending_label = None; 
             current_prevs = vec![node_id];
        }

        let cond_text = &self.source[condition_node.byte_range().start..condition_node.byte_range().end];
        let clean_cond = cond_text.replace('\n', " ").replace('"', "'");
        
        let cond_id = self.next_id();
        self.output.push_str(&format!("    {}{{\"{}\"}}:::decision\n", cond_id, clean_cond));
        
        // Add click action for decision node
        let offset = condition_node.byte_range().start;
        self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\") \"Scroll to source\"\n", cond_id, offset));

        for prev in &current_prevs {
             let arrow = match &pending_label {
                 Some(l) => format!("-->|{}|", l),
                 None => "-->".to_string()
             };
            self.output.push_str(&format!("    {} {} {}\n", prev, arrow, cond_id));
        }

        let consequence = node.child_by_field_name("consequence").unwrap();
        let then_prevs = vec![cond_id.clone()];
        let ended_then = self.traverse_node_with_label(consequence, then_prevs, Some("Yes".to_string()));

        let mut ended_else = vec![cond_id.clone()];
        if let Some(alternative) = node.child_by_field_name("alternative") {
             let else_prevs = vec![cond_id.clone()];
             let else_res = self.traverse_node_with_label(alternative, else_prevs, Some("No".to_string()));
             ended_else = else_res;
        }
        
        let mut result = ended_then;
        result.extend(ended_else);
        result
    }
    
    fn process_loop_with_label(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        // Extract loop condition/header text based on loop type
        let loop_text = match node.kind() {
            "for_statement" => {
                let mut parts = Vec::new();
                if let Some(init) = node.child_by_field_name("init") {
                    parts.push(self.source[init.byte_range().start..init.byte_range().end].to_string());
                }
                if let Some(cond) = node.child_by_field_name("condition") {
                    parts.push(self.source[cond.byte_range().start..cond.byte_range().end].to_string());
                }
                if let Some(update) = node.child_by_field_name("update") {
                    parts.push(self.source[update.byte_range().start..update.byte_range().end].to_string());
                }
                format!("for ({})", parts.join("; "))
            },
            "while_statement" => {
                if let Some(cond) = node.child_by_field_name("condition") {
                    let cond_text = &self.source[cond.byte_range().start..cond.byte_range().end];
                    format!("while {}", cond_text)
                } else {
                    "while (...)".to_string()
                }
            },
            "do_statement" => {
                if let Some(cond) = node.child_by_field_name("condition") {
                    let cond_text = &self.source[cond.byte_range().start..cond.byte_range().end];
                    format!("do...while {}", cond_text)
                } else {
                    "do...while (...)".to_string()
                }
            },
            "enhanced_for_statement" => {
                let type_text = node.child_by_field_name("type")
                    .map(|t| self.source[t.byte_range().start..t.byte_range().end].to_string())
                    .unwrap_or_default();
                let name_text = node.child_by_field_name("name")
                    .map(|n| self.source[n.byte_range().start..n.byte_range().end].to_string())
                    .unwrap_or_default();
                let value_text = node.child_by_field_name("value")
                    .map(|v| self.source[v.byte_range().start..v.byte_range().end].to_string())
                    .unwrap_or_default();
                format!("for ({} {} : {})", type_text, name_text, value_text)
            },
            _ => "loop".to_string()
        };

        let safe_text = loop_text.replace('"', "'").replace('\n', " ");

        // Truncate if too long
        let display_text = if safe_text.len() > 60 {
            format!("{}...", &safe_text[..57])
        } else {
            safe_text
        };

        // Create the loop condition node (hexagon shape)
        let loop_id = self.next_id();
        self.output.push_str(&format!("    {}{{{{\"{}\"}}}}:::loop\n", loop_id, display_text));

        // Add click handler
        let offset = node.byte_range().start;
        self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\") \"Scroll to source\"\n", loop_id, offset));

        // Connect previous nodes to the loop node
        for prev in &prev_ids {
            let arrow = match &label {
                Some(l) => format!("-->|{}|", l),
                None => "-->".to_string()
            };
            self.output.push_str(&format!("    {} {} {}\n", prev, arrow, loop_id));
        }

        // Process the body
        let body = node.child_by_field_name("body");
        let body_end_ids = if let Some(body_node) = body {
            self.traverse_node_with_label(body_node, vec![loop_id.clone()], Some("loop body".to_string()))
        } else {
            vec![loop_id.clone()]
        };

        // Create back-edge from end of body to loop condition (visual loop)
        for end_id in &body_end_ids {
            if end_id != &loop_id {
                self.output.push_str(&format!("    {} -.->|repeat| {}\n", end_id, loop_id));
            }
        }

        // The loop exits to the next node from the loop condition
        vec![loop_id]
    }

    fn process_switch_with_label(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        // Extract the switch condition
        let condition = node.child_by_field_name("condition")
            .map(|c| self.source[c.byte_range().start..c.byte_range().end].to_string())
            .unwrap_or_else(|| "...".to_string());

        let safe_condition = condition.replace('"', "'").replace('\n', " ");

        // Create the switch decision node (diamond shape)
        let switch_id = self.next_id();
        self.output.push_str(&format!("    {}{{\"switch {}\"}}:::decision\n", switch_id, safe_condition));

        // Add click handler
        let offset = node.byte_range().start;
        self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\") \"Scroll to source\"\n", switch_id, offset));

        // Connect previous nodes to switch
        for prev in &prev_ids {
            let arrow = match &label {
                Some(l) => format!("-->|{}|", l),
                None => "-->".to_string()
            };
            self.output.push_str(&format!("    {} {} {}\n", prev, arrow, switch_id));
        }

        // Process the switch body to find case branches
        let body = node.child_by_field_name("body");
        let mut all_exit_ids: Vec<String> = Vec::new();

        if let Some(body_node) = body {
            let mut cursor = body_node.walk();
            let children: Vec<Node> = body_node.children(&mut cursor).collect();

            for child in children {
                if !child.is_named() { continue; }

                // Extract case label text
                let case_label = if child.kind() == "switch_block_statement_group" {
                    let mut label_parts = Vec::new();
                    let mut inner_cursor = child.walk();
                    for inner_child in child.children(&mut inner_cursor) {
                        if inner_child.kind() == "switch_label" {
                            let label_text = &self.source[inner_child.byte_range().start..inner_child.byte_range().end];
                            label_parts.push(label_text.trim().to_string());
                        }
                    }
                    if label_parts.is_empty() { "case".to_string() } else { label_parts.join(", ") }
                } else {
                    let text = &self.source[child.byte_range().start..child.byte_range().end];
                    let first_line = text.lines().next().unwrap_or("case");
                    first_line.trim().to_string()
                };

                let safe_case_label = case_label.replace('"', "'").replace('\n', " ");
                let display_label = if safe_case_label.len() > 30 {
                    format!("{}...", &safe_case_label[..27])
                } else {
                    safe_case_label
                };

                let case_exits = self.traverse_node_with_label(
                    child,
                    vec![switch_id.clone()],
                    Some(display_label)
                );
                all_exit_ids.extend(case_exits);
            }
        }

        // If no cases produced exits, the switch itself is the exit
        if all_exit_ids.is_empty() {
            all_exit_ids.push(switch_id.clone());
        }

        all_exit_ids
    }

    fn process_generic_recursive_with_label(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        let mut current_ids = prev_ids;
        let mut current_label = label;
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
             if child.is_named() {
                 let next_ids = self.dispatch_node(child, current_ids.clone(), current_label.clone());
                 if next_ids != current_ids {
                      current_label = None;
                      current_ids = next_ids;
                 }
             }
        }
        current_ids
    }

    fn find_calls_in_node(&mut self, node: Node) -> Vec<(String, bool, String, usize)> {
        let mut calls = Vec::new();
        self.collect_calls_recursive(node, &mut calls);
        calls
    }

    fn collect_calls_recursive(&mut self, node: Node, calls: &mut Vec<(String, bool, String, usize)>) {
        if node.kind() == "method_invocation" {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name_text = &self.source[name_node.byte_range().start..name_node.byte_range().end];
                let raw_text = &self.source[node.byte_range().start..node.byte_range().end];

                // Check if this call should be ignored
                let mut should_ignore = false;

                if let Some(obj_node) = node.child_by_field_name("object") {
                    let obj_text = &self.source[obj_node.byte_range().start..obj_node.byte_range().end];

                    // Check against ignored_services (replaces hardcoded System.out/System.err)
                    for svc in self.ignored_services.iter() {
                        if raw_text.starts_with(svc.as_str()) || obj_text == svc.as_str() {
                            should_ignore = true;
                            break;
                        }
                    }

                    // Check against ignored_variables
                    if !should_ignore {
                        for var in self.ignored_variables.iter() {
                            if obj_text == var.as_str() || obj_text.starts_with(&format!("{}.", var)) {
                                should_ignore = true;
                                break;
                            }
                        }
                    }
                }

                if !should_ignore {
                    // Determine Internal vs External
                    let mut is_internal = false;
                    if let Some(obj_node) = node.child_by_field_name("object") {
                        let obj_text = &self.source[obj_node.byte_range().start..obj_node.byte_range().end];
                        if obj_text == "this" {
                            is_internal = true;
                        } else {
                            // Track detected external service
                            self.detected_externals.insert(obj_text.to_string());
                        }
                    } else {
                        if self.graph.nodes.contains_key(name_text) {
                            is_internal = true;
                        }
                    }

                    calls.push((name_text.to_string(), !is_internal, raw_text.to_string(), node.byte_range().start));
                }
            }
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.collect_calls_recursive(child, calls);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parser() {
        let source = r#"
        class Student {
            public void study() {
                lesson1();
                homework1();
                homework2();
            }
            private void lesson1() {
                // ...
            }
            private void homework1() {
                // ...
            }
            private void homework2() {
                // ...
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        
        assert!(graph.nodes.contains_key("study"));
        assert!(graph.nodes.contains_key("lesson1"));
        
        let study_node = graph.nodes.get("study").unwrap();
        assert!(study_node.modifiers.contains(&"public".to_string()));
        
        let calls = graph.calls.get("study").unwrap();
        assert_eq!(calls.len(), 3);
        assert_eq!(calls[0], "lesson1");
        assert_eq!(calls[1], "homework1");
        assert_eq!(calls[2], "homework2");
        
        let mermaid = JavaParser::generate_mermaid(&graph, source, None);
        assert!(mermaid.contains("([\"study\"]):::public"));
        assert!(mermaid.contains("lesson1"));
        
        // println!("{}", mermaid);
    }

    #[test]
    fn test_parser_with_external() {
        let source = r#"
        class Student {
            public void study() {
                lesson1();
                teacher.ask();
            }
            private void lesson1() {
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, None);
        println!("{}", mermaid);
        
        assert!(mermaid.contains("([\"study\"]):::public"));
        assert!(mermaid.contains("lesson1"));
        assert!(mermaid.contains("External: teacher.ask"));
    }

    #[test]
    fn test_sequential_flow() {
        let source = r#"
        class Simple {
            public void process() {
                step1();
                service.notify();
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, None);
        println!("Sequential Flow:\n{}", mermaid);

        assert!(mermaid.contains("process"));
        assert!(mermaid.contains("step1"));
        assert!(mermaid.contains("External: service.notify"));
        // Check edges
        // process --> step1? The START node is process.
        // N1([process]) --> step1
    }

    #[test]
    fn test_if_else_flow() {
        let source = r#"
        class Decision {
            public void check(int x) {
                if (x > 0) {
                    positive();
                } else {
                    negative();
                }
                done();
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, None);
        println!("Decision Flow:\n{}", mermaid);

        assert!(mermaid.contains("x > 0"));
        assert!(mermaid.contains("-->|Yes|"));
        assert!(mermaid.contains("-->|No|"));
        assert!(mermaid.contains("positive"));
        assert!(mermaid.contains("negative"));
        assert!(mermaid.contains("done"));
    }

    #[test]
    fn test_external_calls_in_condition() {
        let source = r#"
        class ServiceCall {
            public void run() {
                if (repo.isValid()) {
                    emailService.send();
                }
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, None);
        println!("Condition Calls Flow:\n{}", mermaid);

        assert!(mermaid.contains("External: repo.isValid"));
        assert!(mermaid.contains("External: emailService.send"));
        assert!(mermaid.contains("repo.isValid")); // The decision text itself
        
        // Ensure flow: run -> repo.isValid -> decision
    }

    #[test]
    fn test_recursion_and_return() {
         let source = r#"
        class Logic {
            public void loop() {
                if (check()) return;
                loop();
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, None);
        println!("Recursion Flow:\n{}", mermaid);
        
        assert!(mermaid.contains("return"));
        assert!(mermaid.contains("loop"));
    }

    #[test]
    fn test_method_filtering() {
        let source = r#"
        class Filtering {
            public void publicMethod() {
                privateMethod();
            }
            protected void protectedMethod() {
                // ...
            }
            private void privateMethod() {
                // ...
            }
            void packagePrivateMethod() {
                // ...
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        
        // 1. Default (None) -> Should contain public and protected ONLY
        let mermaid_default = JavaParser::generate_mermaid(&graph, source, None);
        assert!(mermaid_default.contains("([\"publicMethod\"])"));
        assert!(mermaid_default.contains("([\"protectedMethod\"])"));
        assert!(!mermaid_default.contains("([\"privateMethod\"])")); 
        assert!(!mermaid_default.contains("([\"packagePrivateMethod\"])"));
        
        // 2. Specific Private Method -> Should generate graph for it
        let mermaid_private = JavaParser::generate_mermaid(&graph, source, Some("privateMethod".to_string()));
        assert!(mermaid_private.contains("([\"privateMethod\"])"));
        assert!(!mermaid_private.contains("([\"publicMethod\"])"));
    }

    #[test]
    fn test_for_loop_flow() {
        let source = r#"
        class LoopTest {
            public void process() {
                for (int i = 0; i < 10; i++) {
                    doWork();
                }
                done();
            }
            private void doWork() {}
            private void done() {}
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, Some("process".to_string()));
        println!("For Loop Flow:\n{}", mermaid);

        assert!(mermaid.contains("for ("));
        assert!(mermaid.contains(":::loop"));
        assert!(mermaid.contains("repeat"));
        assert!(mermaid.contains("doWork"));
        assert!(mermaid.contains("done"));
    }

    #[test]
    fn test_while_loop_flow() {
        let source = r#"
        class WhileTest {
            public void poll() {
                while (isRunning()) {
                    fetch();
                }
            }
            private void fetch() {}
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, Some("poll".to_string()));
        println!("While Loop Flow:\n{}", mermaid);

        assert!(mermaid.contains("while"));
        assert!(mermaid.contains(":::loop"));
        assert!(mermaid.contains("repeat"));
    }

    #[test]
    fn test_enhanced_for_flow() {
        let source = r#"
        class ForEachTest {
            public void processAll() {
                for (String item : items) {
                    handle(item);
                }
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, Some("processAll".to_string()));
        println!("Enhanced For Flow:\n{}", mermaid);

        assert!(mermaid.contains("for ("));
        assert!(mermaid.contains(":::loop"));
    }

    #[test]
    fn test_switch_flow() {
        let source = r#"
        class SwitchTest {
            public void route(int code) {
                switch (code) {
                    case 1:
                        handleOne();
                        break;
                    case 2:
                        handleTwo();
                        break;
                    default:
                        handleDefault();
                }
            }
            private void handleOne() {}
            private void handleTwo() {}
            private void handleDefault() {}
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, Some("route".to_string()));
        println!("Switch Flow:\n{}", mermaid);

        assert!(mermaid.contains("switch"));
        assert!(mermaid.contains(":::decision"));
    }

    #[test]
    fn test_nested_loop_in_if() {
        let source = r#"
        class NestedTest {
            public void run() {
                if (isReady()) {
                    for (int i = 0; i < count; i++) {
                        process();
                    }
                }
                finish();
            }
            private void process() {}
            private void finish() {}
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let mermaid = JavaParser::generate_mermaid(&graph, source, Some("run".to_string()));
        println!("Nested Flow:\n{}", mermaid);

        assert!(mermaid.contains(":::decision")); // if condition
        assert!(mermaid.contains(":::loop"));     // for loop inside
        assert!(mermaid.contains("finish"));      // after if
    }

    // --- Tests for filtering features (generate_mermaid_filtered) ---

    #[test]
    fn test_variable_ignore_filter() {
        let source = r#"
        class Service {
            public void process() {
                logger.info("start");
                validate();
                logger.debug("done");
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let result = JavaParser::generate_mermaid_filtered(
            &graph, source, Some("process".to_string()),
            &["logger".to_string()],
            &[],
            false,
        );
        println!("Variable Ignore Flow:\n{}", result.mermaid);

        assert!(!result.mermaid.contains("logger.info"));
        assert!(!result.mermaid.contains("logger.debug"));
        assert!(result.mermaid.contains("validate"));
    }

    #[test]
    fn test_service_ignore_filter() {
        let source = r#"
        class Service {
            public void run() {
                repo.save();
                emailService.send();
                notificationService.push();
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let result = JavaParser::generate_mermaid_filtered(
            &graph, source, Some("run".to_string()),
            &[],
            &["emailService".to_string()],
            false,
        );
        println!("Service Ignore Flow:\n{}", result.mermaid);

        assert!(!result.mermaid.contains("emailService.send"));
        assert!(result.mermaid.contains("repo.save"));
        assert!(result.mermaid.contains("notificationService.push"));
    }

    #[test]
    fn test_detected_external_services() {
        let source = r#"
        class Handler {
            public void handle() {
                repo.find();
                cache.get();
                emailService.send();
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let result = JavaParser::generate_mermaid_filtered(
            &graph, source, Some("handle".to_string()),
            &[], &[], false,
        );
        println!("Detected Services: {:?}", result.external_services);

        assert!(result.external_services.contains(&"repo".to_string()));
        assert!(result.external_services.contains(&"cache".to_string()));
        assert!(result.external_services.contains(&"emailService".to_string()));
    }

    #[test]
    fn test_end_node_label() {
        let source = r#"
        class Simple {
            public void doWork() {
                step1();
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        let result = JavaParser::generate_mermaid_filtered(
            &graph, source, Some("doWork".to_string()),
            &[], &[], false,
        );
        println!("End Node Flow:\n{}", result.mermaid);

        assert!(result.mermaid.contains("End of doWork"));
        assert!(result.mermaid.contains(":::endNode"));
    }

    #[test]
    fn test_collapse_details() {
        let source = r#"
        class Complex {
            public void main() {
                helper();
            }
            public void helper() {
                subStep();
            }
            private void subStep() {}
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");

        // Without collapse: both main and helper get subgraphs
        let result_expanded = JavaParser::generate_mermaid_filtered(
            &graph, source, None,
            &[], &[], false,
        );
        // With collapse: simplified overview
        let result_collapsed = JavaParser::generate_mermaid_filtered(
            &graph, source, None,
            &[], &[], true,
        );
        println!("Expanded:\n{}", result_expanded.mermaid);
        println!("Collapsed:\n{}", result_collapsed.mermaid);

        // Collapsed version should be shorter (no subgraph bodies)
        assert!(result_collapsed.mermaid.len() < result_expanded.mermaid.len());
    }
}
