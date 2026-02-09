
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
        
        let mut generator = FlowGenerator {
            source,
            graph,
            output: &mut output,
            node_counter: 0,
        };

        for method_name in target_methods {
             if let Some(node_info) = graph.nodes.get(&method_name) {
                 // Find the node in the tree using the range
                 let start_byte = node_info.range.0;
                 let end_byte = node_info.range.1;
                 
                 // Descend to find the method_declaration at this range
                 // A simple way is to walk from root and find the node with exact range
                 if let Some(method_node) = Self::find_node_by_range(root_node, start_byte, end_byte) {
                      generator.generate_method_flow(method_node, &method_name);
                 }
             }
        }
        
        // Styles
        output.push_str("  classDef public fill:#f9f,stroke:#333,stroke-width:2px;\n");
        output.push_str("  classDef internal fill:#e1f5fe,stroke:#01579b,stroke-width:1px;\n"); // Light Blue
        output.push_str("  classDef external fill:#ffe0b2,stroke:#e65100,stroke-width:1px,stroke-dasharray: 5 5;\n"); // Orange, dashed
        output.push_str("  classDef decision fill:#fff9c4,stroke:#fbc02d,stroke-width:1px,shape:rhombus;\n"); // Yellow Diamond

        output
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

struct FlowGenerator<'a> {
    source: &'a str,
    graph: &'a CallGraph,
    output: &'a mut String,
    node_counter: usize,
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
            self.output.push_str(&format!("    {}(End)\n", end_id));
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
              _ => {
                  self.process_generic_recursive_with_label(node, prev_ids, label)
              }
         }
    }

    fn process_expression_with_label(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        let calls = self.find_calls_in_node(node);
        
        // Even if no calls, if it is a return statement, we might want to show it?
        // User asked: "Detect return statements and early exits"
        // If "return value;", it is a "return_statement".
        let is_return = node.kind() == "return_statement";
        
        if calls.is_empty() && !is_return {
            return prev_ids;
        }

        let mut current_prevs = prev_ids;
        let mut pending_label = label;
         
        for (name, is_external, raw_text) in calls {
             let node_id = self.next_id();
             let text_label = if is_external { format!("External: {}", raw_text) } else { name.clone() };
             let style = if is_external { "external" } else { "internal" };
             
             self.output.push_str(&format!("    {}[\"{}\"]:::{}\n", node_id, text_label, style));
             
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
             
             for prev in &current_prevs {
                 let arrow = match &pending_label {
                     Some(l) => format!("-->|{}|", l),
                     None => "-->".to_string()
                 };
                 self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
             }
             // Return statement usually ends flow.
             // We return empty vec? Or the return node?
             // If we return the return node, subsequent statements (dead code) will link to it.
             current_prevs = vec![node_id]; 
         }
         
         current_prevs
    }

    fn process_if_with_label(&mut self, node: Node, prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        let condition_node = node.child_by_field_name("condition").unwrap();
        
        // 1. Extract calls in condition and link PREVs to them by using process_expression logic
        // But process_expression handles 'statements', here we have an expression inside parens.
        // We can reuse find_calls_in_node.
        
        // We chain: prev_ids -> [Condition Calls] -> Decision Diamond
        let cond_calls = self.find_calls_in_node(condition_node);
        let mut current_prevs = prev_ids;
        let mut pending_label = label;

        for (name, is_external, raw_text) in cond_calls {
             let node_id = self.next_id();
             let text_label = if is_external { format!("External: {}", raw_text) } else { name.clone() };
             let style = if is_external { "external" } else { "internal" };
             let safe_label = text_label.replace('"', "'");
             self.output.push_str(&format!("    {}[\"{}\"]:::{}\n", node_id, safe_label, style));
             
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
        } else {
             // If no else, we just carry forward the decision node as a valid path
             // But implicitly it should be "No".
             // We can't label the NEXT edge from here.
             // But we return it.
        }
        
        let mut result = ended_then;
        result.extend(ended_else);
        result
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

    fn find_calls_in_node(&self, node: Node) -> Vec<(String, bool, String)> {
        let mut calls = Vec::new();
        self.collect_calls_recursive(node, &mut calls);
        calls
    }
    
    fn collect_calls_recursive(&self, node: Node, calls: &mut Vec<(String, bool, String)>) {
        if node.kind() == "method_invocation" {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name_text = &self.source[name_node.byte_range().start..name_node.byte_range().end];
                let raw_text = &self.source[node.byte_range().start..node.byte_range().end];
                
                // Determine External
                let mut is_internal = false;
                if let Some(obj_node) = node.child_by_field_name("object") {
                    let obj_text = &self.source[obj_node.byte_range().start..obj_node.byte_range().end];
                    if obj_text == "this" {
                        is_internal = true;
                    }
                } else {
                    if self.graph.nodes.contains_key(name_text) {
                        is_internal = true;
                    }
                }
                
                if raw_text.starts_with("System.out") || raw_text.starts_with("System.err") {
                    // Ignore
                } else {
                     calls.push((name_text.to_string(), !is_internal, raw_text.to_string()));
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
}
