
use std::collections::{HashMap, HashSet};
use tree_sitter::{Parser, Node};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MethodNode {
    pub name: String,
    // Start/End byte offsets for mapping back to source
    pub range: (usize, usize), 
    pub modifiers: Vec<String>,
    pub return_type: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum FlowStep {
    Call {
        name: String,
        is_external: bool,
        raw_text: String,
        offset: usize,
        line: usize,
    },
    Decision {
        label: String,
        offset: usize,
        line: usize,
        yes_branch: Vec<FlowStep>,
        no_branch: Vec<FlowStep>,
    },
    Loop {
        label: String,
        offset: usize,
        line: usize,
        body: Vec<FlowStep>,
    },
    Switch {
        label: String,
        offset: usize,
        line: usize,
        cases: Vec<(String, Vec<FlowStep>)>,
    },
    Return {
        label: String,
        offset: usize,
        line: usize,
    },
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct CallGraph {
    // Map of Method Name -> Method Details
    pub nodes: HashMap<String, MethodNode>,
    // Adjacency List: Caller -> List of Callees (in order of appearance)
    pub calls: HashMap<String, Vec<String>>,
    // Flow model for each method
    pub flows: HashMap<String, Vec<FlowStep>>,
}

// --- Configuration and API structs ---

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FlowSettings {
    pub ignored_variables: Vec<String>,
    pub ignored_services: Vec<String>,
    pub collapse_details: bool,
    pub show_source_reference: bool,
}

impl Default for FlowSettings {
    fn default() -> Self {
        FlowSettings {
            ignored_variables: vec![],
            ignored_services: vec!["System.out".to_string(), "System.err".to_string()],
            collapse_details: false,
            show_source_reference: false,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MermaidOptions {
    pub session_ignore_services: Vec<String>,
    pub collapse_details: bool,
    pub show_source_reference: bool,
}

impl Default for MermaidOptions {
    fn default() -> Self {
        MermaidOptions {
            session_ignore_services: vec![],
            collapse_details: false,
            show_source_reference: false,
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

        // Pass 2: Analyze method bodies for flows
        let mut flows = HashMap::new();
        for (name, node) in &method_declarations {
             let (steps, calls_list) = Self::analyze_method_flow(*node, source, &method_names);
             method_calls.insert(name.clone(), calls_list);
             flows.insert(name.clone(), steps);
        }

        Ok(CallGraph {
            nodes: methods,
            calls: method_calls,
            flows,
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

    fn analyze_method_flow(node: Node, source: &str, method_names: &HashSet<String>) -> (Vec<FlowStep>, Vec<String>) {
        let mut steps = Vec::new();
        let mut calls_list = Vec::new();
        
        if let Some(body) = node.child_by_field_name("body") {
            Self::collect_flow_recursive(body, source, method_names, &mut steps, &mut calls_list);
        }
        
        (steps, calls_list)
    }

    fn collect_flow_recursive(node: Node, source: &str, method_names: &HashSet<String>, steps: &mut Vec<FlowStep>, calls_list: &mut Vec<String>) {
        if !node.is_named() { return; }

        match node.kind() {
            "block" => {
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    Self::collect_flow_recursive(child, source, method_names, steps, calls_list);
                }
            },
            "expression_statement" | "local_variable_declaration" => {
                let mut node_calls = Vec::new();
                Self::find_calls_in_expr(node, source, method_names, &mut node_calls);
                
                for (name, is_external, raw, offset, line) in node_calls {
                    steps.push(FlowStep::Call {
                        name: name.clone(),
                        is_external,
                        raw_text: raw,
                        offset,
                        line,
                    });
                    if !is_external {
                        calls_list.push(name);
                    }
                }
            },
            "return_statement" => {
                steps.push(FlowStep::Return {
                    label: source[node.byte_range().start..node.byte_range().end].replace('"', "'"),
                    offset: node.byte_range().start,
                    line: node.start_position().row + 1,
                });
            },
            "if_statement" => {
                if let Some(condition) = node.child_by_field_name("condition") {
                    let mut cond_calls = Vec::new();
                    Self::find_calls_in_expr(condition, source, method_names, &mut cond_calls);
                    
                    for (name, is_external, raw, offset, line) in cond_calls {
                        steps.push(FlowStep::Call {
                            name: name.clone(),
                            is_external,
                            raw_text: raw,
                            offset,
                            line,
                        });
                        if !is_external {
                            calls_list.push(name);
                        }
                    }

                    let cond_text = source[condition.byte_range().start..condition.byte_range().end].replace('\n', " ").replace('"', "'");
                    
                    let mut yes_branch = Vec::new();
                    if let Some(consequence) = node.child_by_field_name("consequence") {
                        Self::collect_flow_recursive(consequence, source, method_names, &mut yes_branch, calls_list);
                    }

                    let mut no_branch = Vec::new();
                    if let Some(alternative) = node.child_by_field_name("alternative") {
                        Self::collect_flow_recursive(alternative, source, method_names, &mut no_branch, calls_list);
                    }

                    steps.push(FlowStep::Decision {
                        label: cond_text,
                        offset: condition.byte_range().start,
                        line: condition.start_position().row + 1,
                        yes_branch,
                        no_branch,
                    });
                }
            },
            "for_statement" | "while_statement" | "do_statement" | "enhanced_for_statement" => {
                let mut label = node.kind().to_string();
                let offset = node.byte_range().start;
                let line = node.start_position().row + 1;

                // Improved label extraction
                if node.kind() == "while_statement" {
                    if let Some(cond) = node.child_by_field_name("condition") {
                        label = format!("while {}", &source[cond.byte_range().start..cond.byte_range().end]);
                    }
                } else if node.kind() == "for_statement" {
                     label = "for (...)".to_string();
                } else if node.kind() == "enhanced_for_statement" {
                     label = "for (item : list)".to_string();
                }

                let mut body_steps = Vec::new();
                if let Some(body) = node.child_by_field_name("body") {
                    Self::collect_flow_recursive(body, source, method_names, &mut body_steps, calls_list);
                }

                steps.push(FlowStep::Loop {
                    label: label.replace('"', "'").replace('\n', " "),
                    offset,
                    line,
                    body: body_steps,
                });
            },
            "switch_expression" | "switch_statement" => {
                let mut label = "switch".to_string();
                if let Some(cond) = node.child_by_field_name("condition") {
                     label = format!("switch {}", &source[cond.byte_range().start..cond.byte_range().end]);
                }

                let mut cases = Vec::new();
                if let Some(body) = node.child_by_field_name("body") {
                     let mut cursor = body.walk();
                     for switch_child in body.children(&mut cursor) {
                         if switch_child.kind() == "switch_block_statement_group" {
                             let mut case_label = "case".to_string();
                             let mut case_steps = Vec::new();
                             
                             let mut child_cursor = switch_child.walk();
                             for g_child in switch_child.children(&mut child_cursor) {
                                 if g_child.kind() == "switch_label" {
                                     case_label = source[g_child.byte_range().start..g_child.byte_range().end].to_string();
                                 } else {
                                     Self::collect_flow_recursive(g_child, source, method_names, &mut case_steps, calls_list);
                                 }
                             }
                             cases.push((case_label, case_steps));
                         }
                     }
                }

                steps.push(FlowStep::Switch {
                    label: label.replace('"', "'").replace('\n', " "),
                    offset: node.byte_range().start,
                    line: node.start_position().row + 1,
                    cases,
                });
            },
            _ => {
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    Self::collect_flow_recursive(child, source, method_names, steps, calls_list);
                }
            }
        }
    }

    fn find_calls_in_expr(node: Node, source: &str, method_names: &HashSet<String>, calls: &mut Vec<(String, bool, String, usize, usize)>) {
        if node.kind() == "method_invocation" {
            if let Some(name_node) = node.child_by_field_name("name") {
                let name = source[name_node.byte_range().start..name_node.byte_range().end].to_string();
                let raw = source[node.byte_range().start..node.byte_range().end].trim().to_string();
                let offset = node.byte_range().start;
                let line = node.start_position().row + 1;

                let mut is_internal = false;
                if let Some(obj_node) = node.child_by_field_name("object") {
                    let obj_text = &source[obj_node.byte_range().start..obj_node.byte_range().end];
                    if obj_text == "this" {
                        is_internal = true;
                    }
                } else if method_names.contains(&name) {
                    is_internal = true;
                }

                calls.push((name, !is_internal, raw, offset, line));
            }
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            Self::find_calls_in_expr(child, source, method_names, calls);
        }
    }

    pub fn generate_mermaid(graph: &CallGraph, source: &str, method_name: Option<String>) -> String {
        Self::generate_mermaid_filtered(graph, source, method_name, &[], &[], false, false).mermaid
    }

    pub fn generate_mermaid_filtered(
        graph: &CallGraph,
        _source: &str, // No longer strictly needed for flow generation if model is complete
        method_name: Option<String>,
        ignored_variables: &[String],
        ignored_services: &[String],
        collapse_details: bool,
        show_source_ref: bool,
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

        let mut generator = FlowGenerator {
            graph,
            output: &mut output,
            node_counter: 0,
            ignored_variables,
            ignored_services,
            collapse_details,
            show_source_ref,
            detected_externals: HashSet::new(),
        };

        // Even if filtered, we want to know ALL services for the UI
        for flow in graph.flows.values() {
            generator.collect_all_externals(flow);
        }

        if collapse_details && method_name.is_none() {
            for method_name in &target_methods {
                let node_id = generator.next_id();
                generator.output.push_str(&format!("    {}([\"{}\"]):::public\n", node_id, method_name));
            }
        } else {
            for method_name in &target_methods {
                if let Some(steps) = graph.flows.get(method_name) {
                    generator.generate_method_flow(steps, method_name);
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
}

#[allow(dead_code)]
struct FlowGenerator<'a> {
    graph: &'a CallGraph,
    output: &'a mut String,
    node_counter: usize,
    ignored_variables: &'a [String],
    ignored_services: &'a [String],
    collapse_details: bool,
    show_source_ref: bool,
    detected_externals: HashSet<String>,
}

impl<'a> FlowGenerator<'a> {
    fn generate_method_flow(&mut self, steps: &[FlowStep], method_name: &str) {
        self.output.push_str(&format!("  subgraph {}\n", method_name));
        self.output.push_str("    direction TB\n");
        
        let start_id = self.next_id();
        self.output.push_str(&format!("    {}([\"{}\"]):::public\n", start_id, method_name));

        let end_nodes = self.render_steps(steps, vec![start_id], None);
        let end_id = self.next_id();
        for prev in end_nodes {
            self.output.push_str(&format!("    {} --> {}\n", prev, end_id));
        }
        self.output.push_str(&format!("    {}([\"End of {}\"]):::endNode\n", end_id, method_name));
        
        self.output.push_str("  end\n");
    }

    fn collect_all_externals(&mut self, steps: &[FlowStep]) {
        for step in steps {
            match step {
                FlowStep::Call { is_external, raw_text, .. } => {
                    if *is_external {
                         if let Some(pos) = raw_text.find('.') {
                             self.detected_externals.insert(raw_text[..pos].to_string());
                         } else {
                             self.detected_externals.insert(raw_text.clone());
                         }
                    }
                },
                FlowStep::Decision { yes_branch, no_branch, .. } => {
                    self.collect_all_externals(yes_branch);
                    self.collect_all_externals(no_branch);
                },
                FlowStep::Loop { body, .. } => {
                    self.collect_all_externals(body);
                },
                FlowStep::Switch { cases, .. } => {
                    for (_, case_steps) in cases {
                        self.collect_all_externals(case_steps);
                    }
                },
                _ => {}
            }
        }
    }

    fn render_steps(&mut self, steps: &[FlowStep], mut prev_ids: Vec<String>, mut label: Option<String>) -> Vec<String> {
        for step in steps {
            let next_ids = self.render_step(step, prev_ids.clone(), label.take());
            if next_ids != prev_ids {
                prev_ids = next_ids;
            }
        }
        prev_ids
    }

    fn render_step(&mut self, step: &FlowStep, mut prev_ids: Vec<String>, label: Option<String>) -> Vec<String> {
        match step {
            FlowStep::Call { name, is_external, raw_text, offset, line } => {
                // Apply filters
                if *is_external {
                    let mut should_ignore = false;
                    if let Some(pos) = raw_text.find('.') {
                        let obj = &raw_text[..pos];
                        if self.ignored_services.contains(&obj.to_string()) || self.ignored_variables.contains(&obj.to_string()) {
                            should_ignore = true;
                        }
                    } else if self.ignored_variables.contains(name) {
                        should_ignore = true;
                    }
                    if should_ignore { return prev_ids; }
                } else if self.ignored_variables.contains(name) {
                     // Local variables? The parser only has method calls as 'Call' now
                     // but we might want to extend this.
                }

                let node_id = self.next_id();
                let mut display_name = if *is_external { format!("External: {}", raw_text) } else { name.clone() };
                if self.show_source_ref {
                    display_name = format!("{} (L{})", display_name, line);
                }
                let style = if *is_external { "external" } else { "internal" };
                
                self.output.push_str(&format!("    {}[\"{}\"]:::{}\n", node_id, display_name.replace('"', "'"), style));
                self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\")\n", node_id, offset));

                for prev in &prev_ids {
                    let arrow = match &label {
                        Some(l) => format!("-->|{}|", l),
                        None => "-->".to_string()
                    };
                    self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
                }
                vec![node_id]
            },
            FlowStep::Decision { label: cond_label, offset, line, yes_branch, no_branch } => {
                let node_id = self.next_id();
                let mut display_label = cond_label.clone();
                if self.show_source_ref {
                    display_label = format!("{} (L{})", display_label, line);
                }
                
                self.output.push_str(&format!("    {}{{\"{}\"}}:::decision\n", node_id, display_label.replace('"', "'")));
                self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\")\n", node_id, offset));

                for prev in &prev_ids {
                    let arrow = match &label {
                        Some(l) => format!("-->|{}|", l),
                        None => "-->".to_string()
                    };
                    self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
                }

                let mut exits = self.render_steps(yes_branch, vec![node_id.clone()], Some("Yes".to_string()));
                exits.extend(self.render_steps(no_branch, vec![node_id.clone()], Some("No".to_string())));
                exits
            },
            FlowStep::Loop { label: loop_label, offset, line, body } => {
                let node_id = self.next_id();
                let mut display_label = loop_label.clone();
                if self.show_source_ref {
                    display_label = format!("{} (L{})", display_label, line);
                }

                self.output.push_str(&format!("    {}{{{{\"{}\"}}}}:::loop\n", node_id, display_label.replace('"', "'")));
                self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\")\n", node_id, offset));

                for prev in &prev_ids {
                    let arrow = match &label {
                        Some(l) => format!("-->|{}|", l),
                        None => "-->".to_string()
                    };
                    self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
                }

                let body_exits = self.render_steps(body, vec![node_id.clone()], Some("loop body".to_string()));
                for exit in body_exits {
                    if exit != node_id {
                        self.output.push_str(&format!("    {} -.->|repeat| {}\n", exit, node_id));
                    }
                }
                vec![node_id]
            },
            FlowStep::Return { label: ret_label, offset, line } => {
                let node_id = self.next_id();
                let mut display_label = ret_label.clone();
                if self.show_source_ref {
                    display_label = format!("{} (L{})", display_label, line);
                }

                self.output.push_str(&format!("    {}[\"{}\"]\n", node_id, display_label.replace('"', "'")));
                self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\")\n", node_id, offset));

                for prev in &prev_ids {
                    let arrow = match &label {
                        Some(l) => format!("-->|{}|", l),
                        None => "-->".to_string()
                    };
                    self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
                }
                vec![node_id]
            },
            FlowStep::Switch { label: sw_label, offset, line, cases } => {
                let node_id = self.next_id();
                let mut display_label = sw_label.clone();
                if self.show_source_ref {
                    display_label = format!("{} (L{})", display_label, line);
                }

                self.output.push_str(&format!("    {}{{\"{}\"}}:::decision\n", node_id, display_label.replace('"', "'")));
                self.output.push_str(&format!("    click {} call onNodeClick(\"offset-{}\")\n", node_id, offset));

                for prev in &prev_ids {
                    let arrow = match &label {
                        Some(l) => format!("-->|{}|", l),
                        None => "-->".to_string()
                    };
                    self.output.push_str(&format!("    {} {} {}\n", prev, arrow, node_id));
                }

                let mut exits = Vec::new();
                for (case_label, case_steps) in cases {
                    exits.extend(self.render_steps(case_steps, vec![node_id.clone()], Some(case_label.clone())));
                }
                if exits.is_empty() { exits.push(node_id); }
                exits
            }
        }
    }
    fn next_id(&mut self) -> String {
        self.node_counter += 1;
        format!("N{}", self.node_counter)
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
        
        assert!(mermaid.contains("return;"));
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

        assert!(mermaid.contains("for (...)"));
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

        assert!(mermaid.contains("while (isRunning())"));
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

        assert!(mermaid.contains("for (item : list)"));
        assert!(mermaid.contains("handle(item)"));
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
            &[], &[], false, false,
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
            &[], &[], false, false,
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
            &[], &[], false, false,
        );
        // With collapse: simplified overview
        let result_collapsed = JavaParser::generate_mermaid_filtered(
            &graph, source, None,
            &[], &[], true, false,
        );
        println!("Expanded:\n{}", result_expanded.mermaid);
        println!("Collapsed:\n{}", result_collapsed.mermaid);

        // Collapsed version should be shorter (no subgraph bodies)
        assert!(result_collapsed.mermaid.len() < result_expanded.mermaid.len());
    }

    #[test]
    fn test_show_source_reference() {
        let source = r#"
        class SourceRef {
            public void main() {
                service.call();
                if (check()) {
                    done();
                }
            }
        }
        "#;
        let graph = JavaParser::parse(source).expect("Parse failed");
        
        let result_without = JavaParser::generate_mermaid_filtered(
            &graph, source, Some("main".to_string()),
            &[], &[], false, false
        );
        let result_with = JavaParser::generate_mermaid_filtered(
            &graph, source, Some("main".to_string()),
            &[], &[], false, true
        );
        
        println!("Without Source Ref:\n{}", result_without.mermaid);
        println!("With Source Ref:\n{}", result_with.mermaid);
        
        assert!(!result_without.mermaid.contains("(L"));
        assert!(result_with.mermaid.contains("service.call() (L4)"));
        assert!(result_with.mermaid.contains("check() (L5)"));
    }
}
