import { Header } from "@/components/header/Header";
import React, { PropsWithChildren } from "react";
import { Sidebar } from "./Sidebar";
import { GameSidebar } from "./GameSidebar";

const BlogLayout = ({ children }: PropsWithChildren<{}>) => {
  return (
    <div className="bg-gradient-to-b from-yellow-300 via-blue-300">
      <Header />

      <div className="min-h-screen relative flex container pt-24 md:pt-36 mt-safe">
        <Sidebar />
        <main className="flex-1 md:px-8 pb-12 z-10 pb-36 justify-center min-w-0">
          {children}
        </main>
        <GameSidebar />
      </div>
    </div>
  );
};

export default BlogLayout;
