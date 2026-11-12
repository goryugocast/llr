# LLR view screenshots

The three PNGs below show the development preview documented in the main README. They are fictional examples, not personal daily-note records.

| Image | Use | Pixels |
|---|---|---|
| `llr-tasks.png` | Task list, estimates, running-task emphasis | 1440 × 2092 |
| `llr-timeline.png` | Collapsed timeline overview | 1440 × 2220 |
| `llr-timeline-expanded.png` | The same timeline with an activity’s records and notes expanded | 1440 × 2996 |

Captured in Obsidian on 2026-11-12 using the deployed LLR renderer and a fictional 2026-05-22 day. Task data was passed to SummaryView’s rendering methods; timeline Markdown was passed through ReflectionView.makeDay, including its normal grouping and axis layout. Only the temporary demo element was captured via a clipped screenshot. No vault notes were created or changed. Temporary elements and rendering state were cleaned up afterward.

For future replacements, use the current renderer with fictional data and capture only that element. Do not reuse screenshots of personal records. Keep the overview and expanded image on the same sample day; preserve the deployed time scale and let the renderer position the activity bands.
