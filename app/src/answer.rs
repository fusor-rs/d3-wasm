//! A response as the page draws it: each question's options with their probabilities, the
//! decision marked, and what the answer reads (its confidence, a yes's probability, or a score's
//! expected value); a question the model could not answer, with why.

use serde::Deserialize;
use serde_json::{Map, Value};

/// One option of an answer: its key (with a score's legend), its probability and whether it is
/// the decision.
#[derive(Clone, PartialEq)]
pub(crate) struct Choice {
    pub(crate) index: usize,
    pub(crate) label: String,
    pub(crate) probability: f64,
    pub(crate) chosen: bool,
}

impl Choice {
    pub(crate) fn percent(&self) -> String {
        format!("{:.1}%", self.probability * 100.0)
    }

    /// The width of its bar.
    pub(crate) fn bar(&self) -> String {
        format!("width: {:.2}%", self.probability * 100.0)
    }
}

#[derive(Clone, PartialEq)]
pub(crate) struct Answer {
    pub(crate) name: String,
    pub(crate) kind: &'static str,
    pub(crate) decision: String,
    pub(crate) reading: String,
    pub(crate) choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Response {
    answers: Map<String, Value>,
}

/// An answer as the runtime writes it (`d3::answer`).
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Written {
    Choice {
        choice: String,
        probabilities: Map<String, Value>,
        confidence: f64,
    },
    Noul {
        noul: f64,
    },
    Score {
        score: f64,
        probabilities: Map<String, Value>,
        confidence: f64,
        legend: Map<String, Value>,
    },
}

/// A question the model could not answer.
#[derive(Deserialize)]
struct Failed {
    error: String,
    message: String,
}

/// The answers of a response's JSON, in order; none while there is no response.
pub(crate) fn answers(response: &str) -> Vec<Answer> {
    let Ok(response) = serde_json::from_str::<Response>(response) else {
        return Vec::new();
    };
    let drawn = response.answers.into_iter().filter_map(|(name, answer)| {
        if let Ok(failed) = serde_json::from_value::<Failed>(answer.clone()) {
            return Some(failure(name, failed));
        }
        // An answer the page cannot read is left out rather than drawn wrong.
        serde_json::from_value::<Written>(answer).ok()?.drawn(name)
    });
    drawn.collect()
}

fn failure(name: String, failed: Failed) -> Answer {
    Answer {
        name,
        kind: "Not answered",
        decision: failed.error,
        reading: failed.message,
        choices: Vec::new(),
    }
}

/// Each option of `probabilities` labelled, the likeliest chosen; `None` when a probability is
/// not a number.
fn choices(probabilities: &Map<String, Value>, legend: &Map<String, Value>) -> Option<Vec<Choice>> {
    let shares: Vec<f64> = probabilities
        .values()
        .map(Value::as_f64)
        .collect::<Option<_>>()?;
    let best = shares.iter().copied().fold(f64::MIN, f64::max);
    let options = probabilities.keys().zip(shares).enumerate();
    let choices = options.map(|(index, (key, probability))| Choice {
        index,
        label: match legend.get(key).and_then(Value::as_str) {
            Some(level) => format!("{key} · {level}"),
            None => key.clone(),
        },
        probability,
        chosen: probability == best,
    });
    Some(choices.collect())
}

impl Written {
    fn drawn(self, name: String) -> Option<Answer> {
        let sure = |confidence: f64| format!("{:.0}% sure", confidence * 100.0);
        let answer = match self {
            Written::Choice {
                choice,
                probabilities,
                confidence,
            } => Answer {
                name,
                kind: "Choice",
                decision: choice,
                reading: sure(confidence),
                choices: choices(&probabilities, &Map::new())?,
            },
            Written::Noul { noul } => {
                let yes = noul >= 0.5;
                let option = |index, label: &str, probability| Choice {
                    index,
                    label: label.into(),
                    probability,
                    chosen: (index == 0) == yes,
                };
                Answer {
                    name,
                    kind: "Yes or no",
                    decision: if yes { "yes" } else { "no" }.into(),
                    reading: format!("{:.1}% yes", noul * 100.0),
                    choices: vec![option(0, "yes", noul), option(1, "no", 1.0 - noul)],
                }
            }
            Written::Score {
                score,
                probabilities,
                confidence,
                legend,
            } => Answer {
                name,
                kind: "Score",
                decision: format!("{score:.2}"),
                reading: format!("expected level · {}", sure(confidence)),
                choices: choices(&probabilities, &legend)?,
            },
        };
        Some(answer)
    }
}
