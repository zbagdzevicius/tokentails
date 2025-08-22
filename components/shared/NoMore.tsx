import { cdnFile } from "@/constants/utils";
import Link from "next/link";

interface IProps {
  title?: string;
  subtitle?: string;
}

export const NoMore = ({
  title = "No meowr",
  subtitle = "To continue press a paw",
}: IProps) => {
  return (
    <div className="flex flex-col w-full justify-center items-center mt-4">
      <div className="text-3xl md:text-4xl font-semibold mb-2 md:mb-3 mt-4 px-4">
        {title}
      </div>
      <div className="text-md mb-12 px-4 text-center">{subtitle}</div>
      <Link href={`/`}>
        <button className="animate-spin">
          <img draggable={false} src={cdnFile("logo/paw.png")} />
        </button>
      </Link>
    </div>
  );
};
