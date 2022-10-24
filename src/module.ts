import { BaseModule, CallNextModule, Module, StoreContext } from "pure-cat";
import { NovelAI, resolution, sampler as SAMPLER, model as MODEL } from "nai-studio";
import {
    ClientEvents,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    GatewayIntentBits,
    TextChannel,
    InteractionResponse,
} from "discord.js";
import { random_prompt } from "./random";

async function get_token(email: string, password: string): Promise<string> {
    const nai = new NovelAI();
    return nai.login(email, password);
}

export class NAI extends BaseModule implements Module {
    private tasks = new Map<string, Task>();
    private queues = new Map<string, Task[]>();
    public intents = [GatewayIntentBits.Guilds];

    async interactionCreate(
        args: ClientEvents["interactionCreate"],
        ctx: StoreContext,
        next: CallNextModule,
    ): Promise<void> {
        const interaction = args[0];

        if (interaction.isChatInputCommand()) {
            switch (interaction.commandName) {
                case "auth": {
                    const email = interaction.options.getString("email", true);
                    const password = interaction.options.getString("password", true);

                    interaction.reply({ ephemeral: true, content: "Authenticating ..." });

                    try {
                        const token = await get_token(email, password);
                        const data = await ctx.user<{ "nai-token": string }>();
                        if (data) {
                            data["nai-token"] = token;
                        }
                        interaction.editReply(":white_check_mark: Successfully authenticated");
                    } catch (err) {
                        interaction.editReply(":x: Authentication failed");
                        return;
                    }

                    break;
                }
                case "revoke": {
                    const data = await ctx.user<{ "nai-token"?: string }>();
                    if (data && data["nai-token"]) {
                        data["nai-token"] = undefined;
                        interaction.reply({
                            ephemeral: true,
                            content: ":white_check_mark: Successfully revoked your token",
                        });
                    } else {
                        interaction.reply({
                            ephemeral: true,
                            content: ":x: You have not authorized",
                        });
                    }
                    break;
                }
                case "generate": {
                    const prompt = interaction.options.getString("prompt", true);
                    const negative = interaction.options.getString("negative") || "";
                    const shape = interaction.options.getString("shape");
                    const sampler = interaction.options.getString("sampler");
                    const model = interaction.options.getString("model");
                    let cfg = interaction.options.getNumber("cfg") || 11;
                    cfg = cfg >= 1.1 && cfg <= 100 ? cfg : 11;
                    let steps = interaction.options.getInteger("steps") || 28;
                    steps = steps >= 1 && steps <= 28 ? steps : 28;
                    let batch = interaction.options.getInteger("batch") || 1;
                    batch = batch >= 1 && batch <= 4 ? batch : 1;

                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];

                    const images: Image[] = [];

                    const seed = Math.floor(Math.random() * 2147483648);
                    for (let i = 0; i < batch; i++) {
                        images.push({
                            prompt,
                            negative,
                            shape: ["portrait", "landscape", "square"].includes(shape || "")
                                ? (shape as "portrait" | "landscape" | "square")
                                : "portrait",
                            sampler:
                                (sampler || "") in SAMPLER
                                    ? (sampler as keyof typeof SAMPLER)
                                    : SAMPLER.k_euler_ancestral,
                            model: Object.keys(MODEL).includes(model || "")
                                ? (model as keyof typeof MODEL)
                                : "safe",
                            cfg,
                            steps,
                            seed: (seed + i) % 2147483648,
                        });
                    }

                    const task = {
                        images,
                        issued_by: interaction.user.id,
                        interaction,
                    };

                    this.task(interaction, task, token);
                    break;
                }
                case "random": {
                    const shape = interaction.options.getString("shape");
                    const sampler = interaction.options.getString("sampler");

                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];

                    const images: Image[] = [
                        {
                            prompt: random_prompt(),
                            negative: "nsfw",
                            shape: ["portrait", "landscape", "square"].includes(shape || "")
                                ? (shape as "portrait" | "landscape" | "square")
                                : "portrait",
                            sampler:
                                (sampler || "") in SAMPLER
                                    ? (sampler as keyof typeof SAMPLER)
                                    : SAMPLER.k_euler_ancestral,
                            model: "safe" as const,
                            cfg: 11,
                            steps: 28,
                            seed: Math.floor(Math.random() * 2147483648),
                        },
                    ];

                    const task = {
                        images,
                        issued_by: interaction.user.id,
                        interaction,
                    };

                    this.task(interaction, task, token);
                    break;
                }
                case "series": {
                    const prompt = interaction.options.getString("prompt", true);
                    const negative = interaction.options.getString("negative") || "";
                    const shape = interaction.options.getString("shape");
                    const sampler = interaction.options.getString("sampler");
                    const model = interaction.options.getString("model");
                    const cfg = interaction.options.getNumber("cfg") || 11;
                    const steps = interaction.options.getInteger("steps") || 28;
                    let type = interaction.options.getString("type");

                    type = ["shape", "sampler", "cfg", "steps"].includes(type || "")
                        ? type
                        : "shape";

                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];

                    const base = {
                        prompt,
                        negative,
                        shape: ["portrait", "landscape", "square"].includes(shape || "")
                            ? (shape as "portrait" | "landscape" | "square")
                            : "portrait",
                        sampler:
                            (sampler || "") in SAMPLER
                                ? (sampler as keyof typeof SAMPLER)
                                : SAMPLER.k_euler_ancestral,
                        model: Object.keys(MODEL).includes(model || "")
                            ? (model as keyof typeof MODEL)
                            : "safe",
                        cfg: cfg >= 1.1 && cfg <= 100 ? cfg : 11,
                        steps: steps >= 1 && steps <= 28 ? steps : 28,
                        seed: Math.floor(Math.random() * 2147483648),
                    };

                    const images: Image[] = [];
                    if (type === "shape") {
                        const shapes = ["portrait", "landscape", "square"] as const;
                        for (const shape of shapes) {
                            images.push({ ...base, shape });
                        }
                    } else if (type === "sampler") {
                        const samplers = Object.keys(SAMPLER) as (keyof typeof SAMPLER)[];
                        for (const sampler of samplers) {
                            images.push({ ...base, sampler });
                        }
                    } else if (type === "cfg") {
                        for (let cfg = 2; cfg <= 20; cfg += 2) {
                            images.push({ ...base, cfg });
                        }
                    } else if (type === "steps") {
                        for (let steps = 4; steps <= 28; steps += 4) {
                            images.push({ ...base, steps });
                        }
                    }

                    const task = { issued_by: interaction.user.id, interaction };
                    this.task(interaction, { ...task, images }, token);
                    break;
                }
            }
        } else if (interaction.isButton()) {
            const [action, id] = interaction.customId.split("::");
            if (action === "approve") {
                const task = this.tasks.get(id);
                if (task) {
                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];
                    if (token) {
                        task.approved_by = interaction.user.id;
                        this.queue(token, task);
                        this.tasks.delete(id);
                        interaction.reply({
                            ephemeral: true,
                            content: ":white_check_mark: Approved",
                        });
                        if (
                            Date.now() - task.interaction.createdTimestamp <
                            (14 * 60 + 30) * 1000
                        ) {
                            task.interaction.editReply({
                                content: `:white_check_mark: Approved by <@${interaction.user.id}>, :paintbrush: Generating ...`,
                            });
                        }
                    } else {
                        interaction.reply({
                            ephemeral: true,
                            content: ":x: You are not authenticated",
                        });
                    }
                } else {
                    interaction.reply({
                        ephemeral: true,
                        content: ":x: Task not found",
                    });
                }
            }
        } else {
            await next();
        }
    }

    private async task(interaction: CommandInteraction, task: Task, token?: string): Promise<void> {
        const chan = interaction.channel;
        if (!chan && !(interaction.replied || interaction.deferred)) {
            interaction.reply({ ephemeral: true, content: ":x: Channel not found" });
            return;
        }

        if (
            task.images[0].model !== "safe" &&
            (chan as TextChannel).nsfw === false &&
            !(interaction.replied || interaction.deferred)
        ) {
            interaction.reply({
                ephemeral: true,
                content:
                    ":x: This model may generate NSFW content, please use this command in a NSFW channel",
            });
            return;
        }

        if (token) {
            if (!(interaction.replied || interaction.deferred)) {
                await interaction.reply({ content: ":paintbrush: Generating ..." });
            }
            task.approved_by = interaction.user.id;
            this.queue(token, task);
        } else {
            const task_id = Math.random().toString(36).slice(2);
            this.tasks.set(task_id, task);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve::${task_id}`)
                    .setLabel("Approve")
                    .setStyle(ButtonStyle.Primary),
            );

            if (!(interaction.replied || interaction.deferred)) {
                const seeds = [...new Set(task.images.map((image) => image.seed))].join("`, `");
                const models = [...new Set(task.images.map((image) => image.model))].join("**, **");
                const samplers = [...new Set(task.images.map((image) => image.sampler))].join(
                    "**, **",
                );
                const steps = [...new Set(task.images.map((image) => image.steps))].join("**, **");
                const cfgs = [...new Set(task.images.map((image) => image.cfg))].join("**, **");

                task.reply = await interaction.reply({
                    content: [
                        `:yellow_circle: A task is pending for approval.`,
                        `> **Prompt**: \`${task.images[0].prompt}\``,
                        `> **Negative Prompt**: ${
                            task.images[0].negative ? "`" + task.images[0].negative + "`" : "None"
                        }`,
                        `> \`${seeds}\` | **${models}** model, **${samplers}** sampler, **${steps}** steps, **${cfgs}** scale`,
                    ].join("\n"),
                    components: [row],
                });
                await interaction.followUp({
                    ephemeral: true,
                    content:
                        "The task is pending in queue until one of the authorized users approves it.",
                });
            }
        }
    }

    private queue(token: string, task: Task) {
        if (!this.queues.has(token)) {
            this.queues.set(token, []);
        }
        this.queues.get(token)?.push(task as Task);
        if (this.queues.get(token)?.length === 1) {
            this.draw(token);
        }
    }

    private async draw(token: string): Promise<void> {
        let interaction: CommandInteraction | undefined;

        let retried_count = 0;
        while (retried_count < 3) {
            try {
                const queue = this.queues.get(token);
                if (!queue) {
                    return;
                }

                const task = queue[0];
                if (task) {
                    const nai = new NovelAI(token);
                    interaction = task.interaction;

                    const nsfw =
                        task.images[0].model !== "safe" ||
                        task.images[0].prompt.toLowerCase().includes("nsfw");

                    const seeds = [...new Set(task.images.map((image) => image.seed))].join("`, `");
                    const models = [...new Set(task.images.map((image) => image.model))].join(
                        "**, **",
                    );
                    const samplers = [...new Set(task.images.map((image) => image.sampler))].join(
                        "**, **",
                    );
                    const steps = [...new Set(task.images.map((image) => image.steps))].join(
                        "**, **",
                    );
                    const cfgs = [...new Set(task.images.map((image) => image.cfg))].join("**, **");

                    const files: { name: string; attachment: string | Buffer }[] = task.images.map(
                        (image, i) => ({
                            name: `${nsfw ? "SPOILER_" : ""}${image.seed}_${i}.png`,
                            attachment: `https://via.placeholder.com/${
                                resolution.normal[image.shape].width
                            }x${resolution.normal[image.shape].height}.png?text=${placeholder()}`,
                        }),
                    );

                    const message = {
                        content: [
                            `> **Prompt**: \`${task.images[0].prompt.replace(/[`\\]/g, "")}\``,
                            `> **Negative Prompt**: ${
                                task.images[0].negative
                                    ? "`" + task.images[0].negative.replace(/[`\\]/g, "") + "`"
                                    : "None"
                            }`,
                            `> \`${seeds}\` | **${models}** model, **${samplers}** sampler, **${steps}** steps, **${cfgs}** scale`,
                            `Suggested by: <@${task.issued_by}>`,
                            `Approved by: <@${task.approved_by}>`,
                        ].join("\n"),
                        files,
                        components: [],
                    };

                    if (Date.now() - task.interaction.createdTimestamp < (14 * 60 + 30) * 1000) {
                        await task.interaction.editReply(message);
                    }

                    for (let i = 0; i < task.images.length; i++) {
                        while (retried_count < 3) {
                            try {
                                const image = await nai.image(
                                    task.images[i].prompt,
                                    task.images[i].negative,
                                    {
                                        ...resolution.normal[task.images[i].shape],
                                        sampler: task.images[i].sampler,
                                        model: MODEL[task.images[i].model],
                                        scale: task.images[i].cfg,
                                        steps: task.images[i].steps,
                                        seed: task.images[i].seed,
                                    },
                                );

                                files[i].attachment = image;

                                if (
                                    Date.now() - task.interaction.createdTimestamp <
                                    (14 * 60 + 30) * 1000
                                ) {
                                    const msg = await task.interaction.editReply(message);
                                    const sent = msg.attachments.find(
                                        (item) => item.name === files[i].name,
                                    );
                                    if (sent) {
                                        files[i].attachment = sent.url;
                                    }
                                } else if (i === task.images.length - 1) {
                                    if (task.reply) {
                                        const reply =
                                            await task.interaction.channel?.messages.fetch(
                                                task.reply.id,
                                            );
                                        await reply?.reply(message);
                                    } else {
                                        await task.interaction.channel?.send(message);
                                    }
                                }

                                break;
                            } catch (err) {
                                console.log(err);
                                retried_count++;
                                if (retried_count >= 3) {
                                    throw err;
                                }
                            }
                        }

                        await new Promise((resolve) => setTimeout(resolve, i ? 500 : 0));
                    }

                    retried_count = 999;
                    queue.shift();
                    setTimeout(() => {
                        if (queue.length) {
                            this.draw(token);
                        }
                    }, 500);
                }
            } catch (err) {
                console.log(err);
                ++retried_count;
                if (retried_count === 3 && err instanceof Error && interaction) {
                    if (Date.now() - interaction.createdTimestamp < (14 * 60 + 30) * 1000) {
                        await interaction.editReply(":x: " + err.message);
                    } else {
                        await interaction.channel?.send(":x: " + err.message);
                    }
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 2000 * retried_count));
                }
            }
        }
    }
}

function placeholder(): string {
    const placeholders: [number, string][] = [
        [0.8, "..."],
        [0.05, "%27-%27"],
        [0.05, "*.*"],
        [0.05, "%27w%27"],
        [0.05, "%27o%27"],
    ];

    const rand = Math.random();
    let sum = 0;

    for (const [prob, placeholder] of placeholders) {
        sum += prob;
        if (rand < sum) {
            return placeholder;
        }
    }

    return placeholders[placeholders.length - 1][1];
}

interface Image {
    prompt: string;
    negative: string;
    shape: "portrait" | "landscape" | "square";
    model: keyof typeof MODEL;
    sampler: typeof SAMPLER[keyof typeof SAMPLER];
    cfg: number;
    steps: number;
    seed: number;
}

interface Task {
    images: Image[];
    issued_by: string;
    approved_by?: string;
    interaction: CommandInteraction;
    reply?: InteractionResponse;
}
