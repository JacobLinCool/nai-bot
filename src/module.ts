import { BaseModule, CallNextModule, Module, StoreContext } from "pure-cat";
import { NovelAI, resolution } from "nai-studio";
import {
    ClientEvents,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    GatewayIntentBits,
} from "discord.js";

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
                case "generate": {
                    const prompt = interaction.options.getString("prompt", true);
                    const negative = interaction.options.getString("negative");
                    const shape = interaction.options.getString("shape");

                    const data = await ctx.user<{ "nai-token": string }>();
                    const token = data?.["nai-token"];

                    const task: Partial<Task> = {
                        prompt,
                        negative: negative || "",
                        shape: ["portrait", "landscape", "square"].includes(shape || "")
                            ? (shape as "portrait" | "landscape" | "square")
                            : "portrait",
                        issued_by: interaction.user.id,
                        interaction,
                    };

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
                                `> Negative Prompt: ${
                                    task.negative ? "`" + task.negative + "`" : "None"
                                }`,
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
        try {
            const queue = this.queues.get(token);
            if (!queue) {
                return;
            }

            const task = queue[0];
            if (task) {
                const nai = new NovelAI(token);

                const image = await nai.image(task.prompt, task.negative, {
                    ...resolution.normal[task.shape],
                });

                const message = {
                    content: [
                        `> Prompt: \`${task.prompt}\``,
                        `> Negative Prompt: ${task.negative ? "`" + task.negative + "`" : "None"}`,
                        `> Shape: ${task.shape}`,
                        `Suggested by: <@${task.issued_by}>`,
                        `Approved by: <@${task.approved_by}>`,
                    ].join("\n"),
                    files: [image],
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
        }
    }
}

interface Task {
    prompt: string;
    negative: string;
    shape: "portrait" | "landscape" | "square";
    issued_by: string;
    approved_by?: string;
    interaction: CommandInteraction;
}
