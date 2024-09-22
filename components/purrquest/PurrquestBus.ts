"use client";
import { Events } from "phaser";

// Used to emit events between React components and Phaser scenes
// https://newdocs.phaser.io/docs/3.70.0/Phaser.Events.EventEmitter
const PurrquestBus = new Events.EventEmitter();
export default PurrquestBus;
