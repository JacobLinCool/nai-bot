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
                    const negative = interaction.options.getString("negative");
                    const shape = interaction.options.getString("shape");
                    const sampler = interaction.options.getString("sampler");
                    const model = interaction.options.getString("model");
                    const cfg = interaction.options.getNumber("cfg") || 11;
                    const steps = interaction.options.getInteger("steps") || 28;
                    const batch = interaction.options.getInteger("batch") || 1;

                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];

                    const task = {
                        prompt,
                        negative: negative || "",
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
                        issued_by: interaction.user.id,
                        interaction,
                        batch: batch >= 1 && batch <= 4 ? batch : 1,
                    };

                    this.task(interaction, task, token);
                    break;
                }
                case "random": {
                    const shape = interaction.options.getString("shape");
                    const sampler = interaction.options.getString("sampler");

                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];

                    const task = {
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
                        issued_by: interaction.user.id,
                        interaction,
                        batch: 1,
                    };

                    this.task(interaction, task, token);
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
        if (!chan) {
            interaction.reply({ ephemeral: true, content: ":x: Channel not found" });
            return;
        }

        if (task.model !== "safe" && (chan as TextChannel).nsfw === false) {
            interaction.reply({
                ephemeral: true,
                content:
                    ":x: This model may generate NSFW content, please use this command in a NSFW channel",
            });
            return;
        }

        if (token) {
            interaction.reply({ content: ":paintbrush: Generating ..." });
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

            task.reply = await interaction.reply({
                content: [
                    `:yellow_circle: A task is pending for approval.`,
                    `> **Prompt**: \`${task.prompt}\``,
                    `> **Negative Prompt**: ${task.negative ? "`" + task.negative + "`" : "None"}`,
                    `> **${task.model}** model, **${task.sampler}** sampler, **${task.steps}** steps, **${task.cfg}** scale`,
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
        try {
            const queue = this.queues.get(token);
            if (!queue) {
                return;
            }

            const task = queue[0];
            if (task) {
                const nai = new NovelAI(token);
                interaction = task.interaction;

                const images: Buffer[] = [];
                for (let i = 0; i < task.batch; i++) {
                    const image = await nai.image(task.prompt, task.negative, {
                        ...resolution.normal[task.shape],
                        sampler: task.sampler,
                        model: MODEL[task.model],
                        scale: task.cfg,
                        steps: task.steps,
                        seed: (task.seed + i) % 2147483648,
                    });
                    images.push(image);
                    await new Promise((resolve) => setTimeout(resolve, i ? 500 : 0));
                }

                const nsfw = task.model !== "safe" || task.prompt.toLowerCase().includes("nsfw");

                const message = {
                    content: [
                        `> **Prompt**: \`${task.prompt.replace(/[`\\]/g, "")}\``,
                        `> **Negative Prompt**: ${
                            task.negative ? "`" + task.negative.replace(/[`\\]/g, "") + "`" : "None"
                        }`,
                        `> \`${task.seed}\` | **${task.model}** model, **${task.sampler}** sampler, **${task.steps}** steps, **${task.cfg}** scale`,
                        `Suggested by: <@${task.issued_by}>`,
                        `Approved by: <@${task.approved_by}>`,
                    ].join("\n"),
                    files: images.map((image, i) => ({
                        attachment: image,
                        name: `${nsfw ? "SPOILER_" : ""}${task.seed + i}.png`,
                    })),
                    components: [],
                };

                if (Date.now() - task.interaction.createdTimestamp < (14 * 60 + 30) * 1000) {
                    await task.interaction.editReply(message);
                } else if (task.reply) {
                    const reply = await task.interaction.channel?.messages.fetch(task.reply.id);
                    await reply?.reply(message);
                } else {
                    await task.interaction.channel?.send(message);
                }

                queue.shift();
                if (queue.length) {
                    this.draw(token);
                }
            }
        } catch (err) {
            console.log(err);
            if (err instanceof Error && interaction) {
                if (Date.now() - interaction.createdTimestamp < (14 * 60 + 30) * 1000) {
                    await interaction.editReply(":x: " + err.message);
                } else {
                    await interaction.channel?.send(":x: " + err.message);
                }
            }
        }
    }
}

interface Task {
    prompt: string;
    negative: string;
    shape: "portrait" | "landscape" | "square";
    model: keyof typeof MODEL;
    sampler: typeof SAMPLER[keyof typeof SAMPLER];
    cfg: number;
    steps: number;
    seed: number;
    issued_by: string;
    approved_by?: string;
    batch: number;
    interaction: CommandInteraction;
    reply?: InteractionResponse;
}
