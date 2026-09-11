# projects

This folder is the source and generated page for Ghostmaxxing's catalogue of complementary anti-surveillance projects. It deliberately stays separate from `references/`: references collects papers, documents, articles, and culture, while projects collects named products, prototypes, physical methods, and collective practices pursuing a related objective.

`PROJECTS.json` is the editorial source. `PROJECTS.schema.json` documents its minimal machine-readable contract. `validate-projects.js` checks identifiers, categories, URLs, image metadata, duplicate entries, and the presence of every local image. `build-projects-page.js` validates first and then combines the JSON with `templates/projects.template.html` to overwrite `index.html`. `projects-filter.js` is public runtime JavaScript: it filters generated table rows by one primary adversarial strategy without changing the URL or fetching data.

`CONTRIBUTING-PROJECTS.md` is the maintainer and LLM-agent transformation guide. It defines the editorial boundary, category meanings, research requirements, image handling, writing style, and exact entry format.

Project photographs live in `images/projects/`, not inside this folder. Their JSON records source, credit, and rights-review status. Generated `index.html` is not authoritative and should not be edited manually.
