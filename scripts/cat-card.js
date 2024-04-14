const nodeHtmlToImage = require("node-html-to-image");
const fs = require("fs");
const base64 = require("nodejs-base64-converter");

const catData = {
  img: "../public/cats/black/dig.gif",
  name: "Bagel",
  ability: "Wind",
  abilityDescription:
    "A powerful roar that can stun opponents for a brief moment",
  rescueStory:
    "Found wandering near an ancient temple, Whiskers now uses its mystical powers to help lost and scared kittens find their way.",
  hp: 100,
};

function generateCatCard(name, hp, ability, story, img, abilityDescription) {
  const abilityBackgroundPath = `../public/ability/${catData.ability
    .toUpperCase()
    .replace(/\s+/g, "_")}_BG.webp`;

  const abilityImagePath = `../public/ability/${catData.ability
    .toUpperCase()
    .replace(/\s+/g, "_")}.png`;

  const image = fs.readFileSync("../public/card/base.png");
  const base64Image = new Buffer.from(image).toString("base64");
  const dataURI = "data:image/jpeg;base64," + base64Image;

  const backgroundImageData = fs.readFileSync(abilityBackgroundPath);
  const base64BackgroundImage = new Buffer.from(backgroundImageData).toString(
    "base64"
  );
  const backgroundImage = "data:image/jpeg;base64," + base64BackgroundImage;

  const abilityImageData = fs.readFileSync(abilityImagePath);
  const base64AbilityImage = new Buffer.from(abilityImageData).toString(
    "base64"
  );
  const abilityImage = "data:image/jpeg;base64," + base64AbilityImage;

  const mainImageData = fs.readFileSync("../public/images/home-page/bg-1.jpg");
  const base64MainImageData = new Buffer.from(mainImageData).toString("base64");
  const mainImage = "data:image/jpeg;base64," + base64MainImageData;

  const heroImageData = fs.readFileSync(img);
  const base64HeroImageData = new Buffer.from(heroImageData).toString("base64");
  const heroImage = "data:image/jpeg;base64," + base64HeroImageData;

  const badgeImageData = fs.readFileSync("../public/card/base.png");
  const base64BadgeImageData = new Buffer.from(badgeImageData).toString(
    "base64"
  );
  const badgeImage = "data:image/jpeg;base64," + base64BadgeImageData;

  const fontPath = "../public/fonts/nunito/Nunito-Regular.ttf"; // Replace with the actual path to your font file
  const fontData = fs.readFileSync(fontPath);
  const fontBase64 = base64.encode(fontData);

  const htmlContent = `
   <head>
    <style>
      @font-face {
        font-family: 'Nunito';
        
        src: url(data:application/x-font-ttf;charset=utf-8;base64,${fontBase64}) format('truetype');
      }
    </style>
  </head>
  <style>
        .air {
          --card-glow: #e0fffe
      }
         .nature {
        --card-glow: #88a376
      } 
      .water {
        --card-glow: #36d4fc;
      }
      .fire {
        --card-glow: #eb5b42;
      }
      .wind {
        --card-glow:#97ee5d;
      }
      .electric {
        --card-glow: #f3e24f;
      }
      .dark {
        --card-glow: #ac51d6;
      }
      .storm {
        --card-glow: #106a7a;
      }
      .metal {
        --card-glow: #a3c0c2;
      }
      .sand {
        --card-glow: #8f7f24;
      }
    </style>
    <div  style=" display: flex; align-items: center; justify-content: center; margin:10px ">
       <div id="cardContent" class="${ability}" style="width: 55%; font-family: 'Nunito', sans-serif; border: 8px solid var(--card-glow); height: fit-content; border-radius: 5%; position: relative; overflow: hidden;z-index: 1;">
        <div style="background-image: url(${backgroundImage}); filter: brightness(0.6); width: 100%; height: 100%; position: absolute; top: 0; left: 0; background-size: cover; background-position: center; z-index: -1;"></div>
        <div style=" margin: 0 4px ;display: flex; justify-content: space-between; align-items: center;">
          <div style=" display: flex; align-items: center; justify-items: center;">
            <div style=" position: relative; display: flex; align-items: center; justify-content: center; font-weight: 700;">
             <img src=${badgeImage} alt="badge" style="width: 60px; height: 20px;"/>
            <span style="position: absolute; color: #545454; font-weight: 700;text-transform: uppercase; font-size: 0.75rem;">Basic</span>
            </div>
            <div>
              <h1 style="margin:0 0 0 1.5rem;padding:0; font-size: 1.75rem; line-height: 3rem; font-weight: 700; color: white; text-align: center;">${name}</h1>
            </div>
          </div>
          <div style=" position: relative; display: flex; align-items: center; justify-content: center;">
           <img src=${badgeImage} alt="badge" style="width: 80px; height: 35px;" />
            <h1 style="position: absolute; color: #545454; font-weight: 900; font-size: 1.5rem;"><span style="font-size: 0.75rem; margin-right: 0.25rem">hp</span>${hp}</h1>
          </div>
        </div>

        <div style="margin: 0 16px 3rem 16px; position: relative;">
    <img src=${mainImage} style="width: 100%; height: 12.5rem; border-radius: 12px;">
    <img src=${heroImage} style="width:11rem; height:11rem; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
        </div>

        <div style="margin: 10px 16px ;">
          <h1 style="font-size: 1.5rem; margin:0 0 0 70px ;padding:0; font-weight: 600; color: white;">Story</h1>
          <p style="font-size: 1rem; margin: 0; padding: 0; line-height: 1.375em; color: white;">${story}</p>
        </div>

        <div style="margin: 0 16px;">
          <div style="display: flex; align-items: center; flex-direction: row;">
            <img src=${abilityImage} style="width: 40px; height: 40px;" />
            <h1 style="font-weight: 600; font-size: 1.5rem; margin: 0; padding: 0; margin-left: 30px; color: white;">${ability}</h1>
             </div>
            <p style="font-size: 1rem; margin: 0 0 30px 0 ; padding: 0; line-height: 1.375em; color: white;">${abilityDescription}</p>
      </div>
    </div>
  `;

  nodeHtmlToImage({
    output: "./image.png",
    html: htmlContent,
    content: { imageSource: dataURI },
    selector: "#cardContent",
    transparent: true,
  }).then(() => console.log("The image was created successfully!"));
}
generateCatCard(
  catData.name,
  catData.hp,
  catData.ability,
  catData.rescueStory,
  catData.img,
  catData.abilityDescription
);
