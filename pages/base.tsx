"use client";
import { CatProvider } from "@/context/CatContext";
import dynamic from "next/dynamic";

const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });

export default function Game() {
  return (
    <CatProvider>
      <Base />
    </CatProvider>
  );
}
