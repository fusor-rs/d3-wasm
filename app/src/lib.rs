//! The d3 page. The request (its state, questions, images and videos), deciding it and its live
//! measurements are signals here; `web/app.js` decodes the images and videos, runs the engine
//! worker and reports back through `engine` events.

mod answer;
mod app;
mod examples;
