import { GameEvent } from "@/components/Phaser/events";
import { ICat } from "@/models/cats";

export class SpeechBubble extends Phaser.GameObjects.Container {
  private npcCat: any;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    npcCat: ICat
  ) {
    super(scene, x, y);
    this.npcCat = npcCat;

    const bubbleHtml = `
      <div class="bubble bottom" style="position: relative; left: 20px;"> <!-- Option 2 -->
        ${text}
        <button id="adopt-button" style="
          background-color: #ef4444;
          color: #FCECBB;
          border: 1px solid black;
          padding: 1px 8px;
          border-radius: 5px;
          font-size: 9px;
          font-weight: bold;
          cursor: pointer;
        ">ADOPT</button>
      </div>
    `;

    const domElement = scene.add.dom(0, 0).createFromHTML(bubbleHtml);

    const button = domElement.getChildByID("adopt-button");
    if (button) {
      button.addEventListener("click", () => {
        scene.events.emit(GameEvent.CAT_CARD_DISPLAY, {
          npc: this.npcCat.originalData,
        });
      });
    } else {
      console.warn("Button not found in the DOM element.");
    }
    this.add(domElement);
    const bubbleXOffset = 5;
    const bubbleYOffset = 5;
    this.setPosition(x + bubbleXOffset, y - bubbleYOffset);

    const domXOffset = 5;
    domElement.setPosition(domElement.x + domXOffset, domElement.y);

    scene.add.existing(this);
  }
}
