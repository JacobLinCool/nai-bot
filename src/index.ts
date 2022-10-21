import { Bot } from "pure-cat";
import { FileStore } from "pure-cat-store-file";
import { Events } from "discord.js";
import { NAI } from "./module";

new Bot({ events: [Events.InteractionCreate] })
    .use(new FileStore())
    .use(new NAI())
    .start()
    .then(() => console.log("Bot started!"));
