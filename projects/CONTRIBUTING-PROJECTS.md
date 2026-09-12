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
5. Find the year it was first shown in public: launch, exhibition, conference talk, crowdfunding campaign or publication, whichever came first. Not the year work started, and not the year of the latest press.
6. Find a representative image published by the project or creator.
7. Record the image's original page, credit, and reuse status. Finding an image online is not permission to republish it.
8. Add a demonstration video only when it materially helps explain the project.

## Year and target: the genealogy fields

`genealogy.html` is drawn from this file and from `references/REFERENCES.json` by `scripts-dev/build-genealogy.py`. Two fields place a project on that chart.

- `year` is the first public showing, as an integer. It sets the horizontal position of the mark.
- `target` is what the project says it aims at, as one or more tags from `tag_definitions.target` at the top of `PROJECTS.json`, most specific first. It picks the row (the family of reading system) and decides whether the mark is drawn as aimed at a face system (pink ring) or at another target (yellow ring: a person or object detector, a plate reader, a sensor, a camera flash).

A target describes the claim, not its success: `nir-face-recognition` on a pair of glasses means the maker aims at infrared face capture, not that the glasses were shown to affect it. Non-face targets are welcome. A garment aimed at person detection belongs on the chart, drawn in the other-target colour, because it addresses a recognition technology.

Rows, and the targets that land on them:

| Row | Targets |
|---|---|
| Face detection | `face-detection` |
| Landmark geometry | `face-landmarks` |
| Learned embeddings | `face-recognition`, `face-verification`, `gender-classification`, `public-space-surveillance`, `person-detection`, `object-detection`, `image-classification`, `license-plate-recognition` |
| Depth and near-infrared | `nir-face-recognition`, `3d-face-recognition`, `depth-face-recognition`, `sensor-disturbance`, `security-camera`, `thermal-imaging`, `flash-photography` |
| Networked readers | `networked-surveillance`, `watchlist-matching` |
| Wearable readers | `wearable-camera`, `smart-glasses` |

When several targets point to different rows, the sensor row wins, then landmarks, then detection, then embeddings. To add a tag, add it to `tag_definitions.target` and to the row table in `scripts-dev/build-genealogy.py`; the build stops on a tag it cannot place.

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
  "year": 2021,
  "target": ["face-detection"],
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
npm run update:genealogy
```

Validation rejects undeclared categories, undeclared targets, a missing or implausible year, duplicate slugs, malformed links, and missing local images. The third command redraws `genealogy.html`, which places every project by its year and target. Then open `/projects/`, test every category button, follow every external link, and review the mobile layout. Generated `projects/index.html` is output: edit the JSON, template, stylesheet, or filter script instead.
