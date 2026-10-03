import { cdnFile } from "@/constants/utils";
import Link from "next/link";

interface IProps {
  title?: string;
  subtitle?: string;
  /** "night" sets cream/gold ink for pages that sit on the global night background (404). The
   * feed keeps inheriting its own ink. */
  tone?: "inherit" | "night";
}

export const NoMore = ({
  title = "No meowr",
  subtitle = "To continue press a paw",
  tone = "inherit",
}: IProps) => {
  const night = tone === "night";
  return (
    <div className="flex flex-col w-full justify-center items-center mt-4">
      <div
        className={`text-3xl md:text-4xl font-semibold mb-2 md:mb-3 mt-4 px-4${night ? " text-tt-gold-400" : ""}`}
      >
        {title}
      </div>
      <div
        className={`text-md mb-12 px-4 text-center${night ? " text-tt-cream" : ""}`}
      >
        {subtitle}
      </div>
      <Link href={`/`}>
        <button className="animate-spin">
          <img draggable={false} src={cdnFile("logo/paw.webp")} alt="Back to home" />
        </button>
      </Link>
    </div>
  );
};
