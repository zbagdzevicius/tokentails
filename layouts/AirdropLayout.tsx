import React, { PropsWithChildren } from "react";
import { GameSidebar } from "./GameSidebar";
import { EntityMetadataProvider } from "@/context/EntityMetadataContext";
import { Header } from "./Header";

const AirdropLayout = ({ children }: PropsWithChildren<{}>) => {
    return (
        <EntityMetadataProvider>
            <div className="min-h-screen flex flex-col bg-gradient-to-b from-yellow-300 via-blue-300">
                <Header />

                <div className="flex flex-1 justify-center items-center px-4">
                    <main className="w-full max-w-xl md:px-8 py-12 md:py-24 flex justify-center items-center">
                        {children}
                    </main>
                </div>
            </div>
        </EntityMetadataProvider>
    );
};

export default AirdropLayout;
