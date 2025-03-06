import { IMAGE_API } from "@/api/image-api";
import { IImage } from "@/models/image";
import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";

interface IProps {
  maxFiles?: number;
  value: IImage[];
  onChange: (value: IImage[]) => void;
}

export function Previews({ maxFiles, value, onChange }: IProps) {
  maxFiles = maxFiles || 5;
  const [isUploading, setIsUploading] = useState(false);
  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      "image/*": [],
    },
    onDrop: async (acceptedFiles: File[]) => {
      try {
        setIsUploading(true);
        const slicedFiles = acceptedFiles.slice(
          0,
          (maxFiles || 0) - value.length
        );
        const uploadedImages = await Promise.all(
          slicedFiles.map((slicedFile) =>
            IMAGE_API.uploadImage(slicedFile, { name: slicedFile.name })
          )
        );
        const uniqueFiles = [...value, ...uploadedImages]
          .filter(
            (obj1, i, arr) =>
              arr.findIndex((obj2) => obj2.name === obj1.name) === i
          )
          .slice(0, maxFiles);

        onChange(uniqueFiles);
        setIsUploading(false);
      } catch (error) {
        console.error(error);
        setIsUploading(false);
      }
    },
  });

  const removeFile = (file: IImage) => {
    const newFiles = [...value];
    newFiles.splice(newFiles.indexOf(file), 1);
    onChange(newFiles);
  };

  const thumbs = value.map((file: IImage, index) => (
    <div className="w-auto box-border mb-2 inline-flex" key={index}>
      <div className="min-w-0 overflow-hidden flex relative">
        <img
          src={file.url}
          className="h-32 rounded-lg w-auto mr-4"
          // Revoke data uri after image is loaded
          onLoad={() => {
            URL.revokeObjectURL(file.url);
          }}
        />
        <button
          onClick={() => removeFile(file)}
          className="w-6 rounded-xl h-6 absolute top-0 right-4 bg-red-500 text-white"
        >
          X
        </button>
      </div>
    </div>
  ));

  useEffect(() => {
    // Make sure to revoke the data uris to avoid memory leaks, will run on unmount
    return () => value.forEach((file: IImage) => URL.revokeObjectURL(file.url));
  }, [value]);

  return (
    <section className={isUploading ? "opacity-75" : ""}>
      {value.length < (maxFiles || 0) && (
        <div
          {...getRootProps({
            className:
              "dropzone py-4 bg-red-500 text-yellow-300 font-secondary text-p4 px-4 rounded-lg border-4 border-dashed border-main-black relative",
          })}
        >
          <input {...getInputProps()} />
          <p>
            {isUploading
              ? "Uploading..."
              : "Drag & drop cat image here, or click to select"}
          </p>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 border-t-4 border-b-4 border-main-black border-dashed rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}
      {!!value?.length && (
        <aside className="justify-center flex flex-wrap mt-2">{thumbs}</aside>
      )}
    </section>
  );
}
