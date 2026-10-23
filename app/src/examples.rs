//! The requests the page offers to start from: the model card's own examples, a state and
//! questions as the editors hold them, with the image or video they ask about.

/// An example request: its state (JSON or words), its questions (a JSON object) and its media's
/// paths under `/examples/`, with a hint of what to try.
#[derive(Clone, PartialEq)]
pub(crate) struct Example {
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    pub(crate) hint: &'static str,
    pub(crate) state: &'static str,
    pub(crate) questions: &'static str,
    pub(crate) media: &'static [&'static str],
}

pub(crate) const EXAMPLES: [Example; 3] = [
    Example {
        id: "support",
        label: "Support ticket",
        hint: "Route a customer's message: edit the state or the questions, then press Decide.",
        state: include_str!("../examples/support/state.txt"),
        questions: include_str!("../examples/support/questions.json"),
        media: &[],
    },
    Example {
        id: "receipt",
        label: "Receipt",
        hint: "A receipt attached: ask what it shows, or add your own image.",
        state: include_str!("../examples/receipt/state.txt"),
        questions: include_str!("../examples/receipt/questions.json"),
        media: &["example-receipt.png"],
    },
    Example {
        id: "clip",
        label: "Video clip",
        hint: "A short video attached, read at 2 frames a second: ask what happens in it.",
        state: include_str!("../examples/clip/state.txt"),
        questions: include_str!("../examples/clip/questions.json"),
        media: &["example-video.webm"],
    },
];
