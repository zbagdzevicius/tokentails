import { IImage } from "@/models/image";

export function getRefId(content: string): string {
  return content.replace(/\[img-([^\]]*)\]/, "$1");
}

export function replaceRefsWithImages(
  content: string,
  images: IImage[]
): string {
  let updatedContent = content;
  const refs = content.match(/\[img-[^\]]*\]/gm) || [];
  for (const ref of refs) {
    const refId = getRefId(ref);
    const image = images.find((image) => image._id === refId);
    if (!image) {
      console.warn(`No image for ref ${refId}`);
      return updatedContent;
    }
    updatedContent = updatedContent.replace(
      ref,
      `<figure class="image-container"><img class="w-full" width="480" height="480" alt="${
        image.title || ""
      }" src="https://api.sveikauk.lt/i/image-resizer/resize?width=600&image=${
        image.url
      }"><figcaption>${image?.caption || ""}</figcaption></figure>`
    );
  }

  return updatedContent;
}
