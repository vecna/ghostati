# Adding a complementary project

This document is written for maintainers and LLM agents converting a newly discovered project into `PROJECTS.json`.

## Editorial boundary

Add a project when it presents a concrete product, prototype, method, workshop practice, wearable, object, or optical intervention intended to resist or critically intervene in automated surveillance of people. Paid and free approaches are both eligible. Historical and discontinued projects remain eligible when they introduced a distinct approach.

Do not duplicate ordinary papers, articles, interviews, bibliographies, or cultural commentary here. Those belong in `references/REFERENCES.json`. A research paper belongs in this page only when it has become a named, documented physical project or publicly usable implementation.

Do not describe a project as guaranteed protection. State what it targets and distinguish face detection, face matching, person detection, and camera acquisition.

## Choose exactly one category

- `face-dazzling` — breaks or obscures the facial geometry needed for face detection. Examples include asymmetric makeup and collective masks.
- `face-mismatching` — a face remains detectable, but the project attempts to alter, replace, or confuse its identity.
- `decoy-flooding` — supplies extra machine-readable faces or competing face-like signals around the wearer.
- `full-body-scrambling` — targets person or object detection across clothing or the body, before face analysis.
- `sensor-dazzling` — targets image acquisition itself, including infrared illumination, exposure, reflection, or depth sensing.

Choose the category that best describes the project's primary mechanism. Do not add secondary category arrays or tags. If the project genuinely has two independent products, add two entries only when each has its own stable presentation page.

## Required research

1. Find the project's canonical page, preferably maintained by its creator.
2. Confirm whether it is currently active, archived, or of unknown status.
3. Confirm whether people can buy it, build it, attend it, or only study the prototype.
4. Identify the exact technical layer it claims to affect.
5. Find a representative image published by the project or creator.
6. Record the image's original page, credit, and reuse status. Finding an image online is not permission to republish it.
7. Add a demonstration video only when it materially helps explain the project.

## Writing the description

Write two or three plain-English sentences. Sentence one says what the project is and who made it. Sentence two explains its mechanism and intended goal. Use a third sentence only for a material limitation, historical status, or distinction between detector and matcher.

Avoid promotional adjectives, unverifiable effectiveness claims, star ratings, and Ghostmaxxing-specific scores. Attribute uncertain claims: “the project is intended to…” is more accurate than “the product makes cameras blind.”

## Image preparation

- Store the publication asset at `/images/projects/<slug>.webp`.
- Prefer a landscape photograph or project still with a 3:2 crop; the page uses a fixed 720×480 presentation box.
- Never stretch an image. Crop from the centre only after checking that the relevant garment, face, or object remains visible.
- Write alt text that describes what the image communicates; do not repeat the project name alone.
- Keep `source_url`, `credit`, and `rights_status` accurate even though only the source and credit appear on the public page.
- If reuse has not been cleared, leave an explicit review warning in `rights_status`. Do not invent a licence.

## Minimal entry shape

```json
{
  "slug": "example-project",
  "name": "Example Project",
  "url": "https://example.org/project",
  "category": "face-dazzling",
  "status": "active",
  "access": "free-diy",
  "description": "Two or three factual sentences in English.",
  "image": {
    "src": "/images/projects/example-project.webp",
    "alt": "What is visibly demonstrated in the image.",
    "source_url": "https://example.org/project",
    "credit": "Creator or institution",
    "rights_status": "Permission granted, licence, or review warning."
  },
  "links": [
    {
      "label": "Watch the demonstration",
      "url": "https://example.org/video"
    }
  ]
}
```

## Validate and publish

Run from the repository root:

```sh
npm run validate:projects
npm run update:projects
```

Validation rejects undeclared categories, duplicate slugs, malformed links, and missing local images. Then open `/projects/`, test every category button, follow every external link, and review the mobile layout. Generated `projects/index.html` is output: edit the JSON, template, stylesheet, or filter script instead.
