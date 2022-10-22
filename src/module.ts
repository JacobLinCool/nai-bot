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

                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];

                    const task: Partial<Task> = {
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
                        issued_by: interaction.user.id,
                        interaction,
                    };

                    this.task(interaction, task as Task, token);
                    break;
                }
                case "random": {
                    const shape = interaction.options.getString("shape");
                    const sampler = interaction.options.getString("sampler");

                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];

                    const task: Partial<Task> = {
                        prompt: random_prompt(),
                        negative: "nsfw",
                        shape: ["portrait", "landscape", "square"].includes(shape || "")
                            ? (shape as "portrait" | "landscape" | "square")
                            : "portrait",
                        sampler:
                            (sampler || "") in SAMPLER
                                ? (sampler as keyof typeof SAMPLER)
                                : SAMPLER.k_euler_ancestral,
                        model: "safe",
                        issued_by: interaction.user.id,
                        interaction,
                    };

                    this.task(interaction, task as Task, token);
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
            this.queue(token, task as Task);
        } else {
            const task_id = Math.random().toString(36).slice(2);
            this.tasks.set(task_id, task as Task);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve::${task_id}`)
                    .setLabel("Approve")
                    .setStyle(ButtonStyle.Primary),
            );

            await interaction.reply({
                content: [
                    `:yellow_circle: A task is pending for approval.`,
                    `> Prompt: \`${task.prompt}\``,
                    `> Negative Prompt: ${task.negative ? "`" + task.negative + "`" : "None"}`,
                    `> Shape: ${task.shape}`,
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

                const image = await nai.image(task.prompt, task.negative, {
                    ...resolution.normal[task.shape],
                    sampler: task.sampler,
                    model: MODEL[task.model],
                });

                const message = {
                    content: [
                        `> Prompt: \`${task.prompt}\``,
                        `> Negative Prompt: ${task.negative ? "`" + task.negative + "`" : "None"}`,
                        `> Shape: ${task.shape}`,
                        `Suggested by: <@${task.issued_by}>`,
                        `Approved by: <@${task.approved_by}>`,
                    ].join("\n"),
                    files:
                        task.model === "safe" && !task.prompt.toLowerCase().includes("nsfw")
                            ? [image]
                            : [{ attachment: image, name: "SPOILER_IMAGE.png" }],
                };

                if (Date.now() - task.interaction.createdTimestamp < (14 * 60 + 30) * 1000) {
                    await task.interaction.editReply(message);
                } else {
                    const reply = await task.interaction.fetchReply();
                    await reply.reply(message);
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
                    const reply = await interaction.fetchReply();
                    await reply.reply(":x: " + err.message);
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
    issued_by: string;
    approved_by?: string;
    interaction: CommandInteraction;
}
