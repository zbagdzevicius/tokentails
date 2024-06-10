"use client";
import dynamic from "next/dynamic";

const Base = dynamic(() => import("@/components/base/Base"), { ssr: false });

export default function Game() {
    return <Base />;
}
