import { BlessingStatus, CatAbilityType, ICat, Tier } from "@/models/cats";

// Card styling constants
export const CARD_BORDER_COLOR = "#FFDBF1";

export const fakeCat: ICat = {
  _id: "693712809f8ef75e6f2bf60f",
  name: "Elena",
  resqueStory: '<p class="p1">Rascal is a proper trooper.</p>',
  supply: 180,
  totalSupply: 200,
  tier: Tier.COMMON,
  type: CatAbilityType.ELECTRIC,
  spriteImg:
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/RASCAL/bow-tie-red.webp",
  catImg:
    "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/RASCAL/bow-tie-red/RUNNING.gif",
  origin: "RASCAL",
  status: {
    EAT: 0,
  },
  owner: "66f4fb69fbe634f35473cc07",
  blessing: {
    _id: "68175ab52493c85932c93ea8",
    catAvatar:
      // "https://tokentails.fra1.cdn.digitaloceanspaces.com/c74f1e31-acc5-4de5-b7f5-b3349d9491a1.png",
      // "https://tokentails.fra1.cdn.digitaloceanspaces.com/9e933881-2846-4017-a12e-2aab7c6b29ef.webp",
      // "https://tokentails.fra1.cdn.digitaloceanspaces.com/2d5b093a-d5cc-4fd9-a129-128c5b785c21.webp",
      // "https://tokentails.fra1.cdn.digitaloceanspaces.com/b0dab525-966a-4298-9160-64971e95490f.webp",
      // "https://tokentails.fra1.cdn.digitaloceanspaces.com/cac23ced-cfb3-467e-8309-6d8e2cc2d316.webp",
      {
        _id: "68175ab52493c85932c93ea8",
        url: "https://tokentails.fra1.cdn.digitaloceanspaces.com/a56aeca2-b6fc-4fcf-97a7-c3af176e66f4.webp",
      },
    // "sample.png",
    name: "Elena",
    description:
      "Elenytė is a young Bengal mix, bought from a backyard breeder with no papers. At first, she was just a pretty whim. Later, she was given away. And when she peed outside the litter box – suddenly, she was no longer wanted. No one took her to the vet. No one asked why. Just: “Someone take her.”",
    birthDate: "2025-05-04T12:16:53.934Z",
    image: {
      _id: "68175aaa2493c85932c93ea3",
      url: "https://tokentails.fra1.cdn.digitaloceanspaces.com/74162312375.png",
    },
    price: 1000,
    instagram: "https://www.instagram.com/a_ginger_cat_named_rascal/",
    creator: "6617964db58ff94dad48febc",
    cat: "68175ab52493c85932c93ea9",
    status: BlessingStatus.WAITING,
    owner: "675f4533cdb28696a94806fc",
    createdAt: "2025-05-04T12:16:54.063Z",
    updatedAt: "2025-05-04T17:47:42.250Z",
    __v: 0,
  },
  tokenId: 92343186759,
  shelter: {
    _id: "675f4533cdb28696a94806fc",
    name: "Rozine Pedute",
    slug: "cat-haven-rescue",
    country: "LT",
    description:
      "A loving shelter dedicated to rescuing and rehoming cats in need.",
    address: "123 Rescue Lane, Austin, TX",
    website: "https://cathaven.org",
    instagram: "https://www.instagram.com/cathaven",
  },
  token: {
    sei: null,
  },
  createdAt: "2025-12-08T18:01:36.917Z",
  updatedAt: "2025-12-19T01:00:00.003Z",
  __v: 0,
};
