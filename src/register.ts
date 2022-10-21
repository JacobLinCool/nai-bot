import { config } from "dotenv";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
    new SlashCommandBuilder()
        .setName("auth")
        .setDescription(
            "Login into NovelAI (Email/password will not be stored, only a token will be stored)",
        )
        .addStringOption((option) =>
            option.setName("email").setDescription("Your NovelAI email").setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("password").setDescription("Your NovelAI password").setRequired(true),
        ),
    new SlashCommandBuilder()
        .setName("generate")
        .setDescription("Generate an image")
        .addStringOption((option) =>
            option.setName("prompt").setDescription("The prompt for the image").setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("negative")
                .setDescription("The negative prompt for the image")
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("shape")
                .setDescription("The shape of the image")
                .addChoices(
                    { name: "Portrait", value: "portrait" },
                    { name: "Landscape", value: "landscape" },
                    { name: "Square", value: "square" },
                )
                .setRequired(false),
        ),
].map((command) => command.toJSON());

config();
(async () => {
    if (!process.env.BOT_TOKEN) {
        console.error("No bot token provided");
        process.exit(1);
    }
    if (!process.env.BOT_ID) {
        console.error("No bot id provided");
        process.exit(1);
    }

    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = (await rest.put(Routes.applicationCommands(process.env.BOT_ID), {
            body: commands,
        })) as unknown[];

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (err) {
        console.error(err);
    }
})();
