const colors = [
    "gray",
    "brown",
    "orange",
    "blonde",
    "yellow",
    "green",
    "teal",
    "cyan",
    "sky",
    "blue",
    "indigo",
    "violet",
    "purple",
    "fuchsia",
    "pink",
    "crimson",
    "red",
    "beige",
    "silver",
    "white",
    "black",
];

const types = [
    "pixel art",
    "official art",
    "sketch art",
    "game cg",
    "photorealistic",
    "aestheticism",
];

const mediums = ["watercolor", "watercolor pencil", "oil painting", "pastel"];

const styles = [
    "by Wadim Kashin",
    "by Gaston Bussiere, by Sophie Anderson, by WLOP",
    "by Georges Pierre Seurat",
    "by Vincent van Gogh",
    "by Paul Cezanne",
    "by Jean-Honore Fragonard, by Francois Boucher, by Jean-Antoine Watteau",
    "by Studio Ghibli",
    "by William Holman Hunt",
];

const clothes = ["kimono", "school uniform", "suit", "t-shirt", "dress", "coat", "jacket", "shirt"];

export function random_prompt(): string {
    const prompt: string[] = [];

    const traits: [number, string[]][] = [
        [0.9, ["masterpiece"]],
        [0.9, ["best quality"]],
        [0.9, ["highly detailed"]],
        [0.8, [`${color()} hair`]],
        [0.8, [`${color()} eyes`]],
        [0.5, ["gradient hair"]],
        [0.5, ["floating hair"]],
        [0.5, ["long hair", "short hair"]],
        [0.5, types],
        [0.5, mediums],
        [0.5, [...clothes, ...clothes.map((c) => `${color()} ${c}`)]],
        [0.5, ["exited", "happy", "sad", "angry", "scared", "confused", "expressionless"]],
        [0.5, ["full-body", "upper-body"]],
        [0.5, ["looking at viewer", "looking away"]],
        [0.5, ["from above", "from below"]],
        [0.3, styles],
        [0.3, [`${color()} background`]],
        [0.3, ["beautiful detailed water"]],
        [0.3, ["beautiful detailed sky"]],
        [
            0.3,
            [
                "floating cherry blossom",
                "floating maple leaf",
                "floating flowers",
                "floating waterdrops",
            ],
        ],
        [0.3, ["dynamic angle"]],
        [0.3, ["backlighting"]],
        [0.3, ["cinematic lighting"]],
        [0.3, ["face close-up", "eye close-up"]],
        [0.3, ["cat ears, cat tail", "dog ears, dog tail", "fox ears, fox tail"]],
        [0.3, ["foreground focus", "fish eye lens", "depth of field"]],
        [0.3, ["hair ornament"]],
        [0.2, ["chibi"]],
        [0.2, ["monochrome"]],
    ];

    for (const [prob, options] of traits) {
        if (Math.random() < prob) {
            const weight = Array.from({ length: 5 }, () => Math.floor(0.4 + Math.random())).filter(
                Boolean,
            ).length;

            prompt.push(
                "{".repeat(weight) +
                    options[Math.floor(Math.random() * options.length)] +
                    "}".repeat(weight),
            );
        }
    }

    return prompt.join(", ");
}

function color(): string {
    return colors[Math.floor(Math.random() * colors.length)];
}
