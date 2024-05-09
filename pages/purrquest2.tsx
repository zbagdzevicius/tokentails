"use client";
import dynamic from "next/dynamic";

const PurrQuest = dynamic(() => import("@/components/purrquest/PurrQuest"), { ssr: false });

export default function Game() {
    return <PurrQuest />;
}
