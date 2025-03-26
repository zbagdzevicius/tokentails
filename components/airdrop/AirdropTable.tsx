import React from "react";
import { Loader } from "@/components/shared/Loader";
import { NoMore } from "@/components/shared/NoMore";
import { AirdropTableProps } from "@/models/airdrop";

const memeCats: Record<number, string> = {
    1: "meme-40.gif",
    2: "meme-1.gif",
    3: "meme-6.gif",
    4: "meme-101.gif",
    5: "meme-5.png",
    6: "meme-3.png",
    7: "meme-7.gif",
    8: "meme-8.png",
    9: "meme-9.png",
    10: "meme-10.png",
    11: "meme-11.png",
    12: "meme-12.png",
    13: "meme-13.png",
    14: "meme-14.gif",
    15: "meme-15.png",
    16: "meme-16.png",
    17: "meme-17.png",
    18: "meme-18.png",
    19: "meme-19.png",
    20: "meme-20.png",
    21: "meme-21.gif",
    22: "meme-22.gif",
    23: "meme-23.gif",
    24: "meme-24.gif",
    25: "meme-25.png",
    26: "meme-26.png",
    27: "meme-27.png",
    28: "meme-28.png",
    29: "meme-29.png",
    30: "meme-30.gif",
    31: "meme-31.gif",
    32: "meme-32.png",
    33: "meme-33.png",
    34: "meme-34.gif",
    35: "meme-35.png",
    36: "meme-36.png",
    37: "meme-37.png",
    38: "meme-38.png",
    39: "meme-39.png",
    40: "meme-2.png",
    41: "meme-41.png",
    42: "meme-42.png",
    43: "meme-43.png",
    44: "meme-44.png",
    45: "meme-45.png",
    46: "meme-46.gif",
    47: "meme-47.png",
    48: "meme-48.gif",
    49: "meme-49.png",
    50: "meme-50.png",
    51: "meme-51.png",
    52: "meme-52.png",
    53: "meme-53.png",
    54: "meme-54.png",
    55: "meme-55.png",
    56: "meme-56.png",
    57: "meme-57.png",
    58: "meme-58.png",
    59: "meme-59.png",
    60: "meme-60.png",
    61: "meme-61.png",
    62: "meme-62.png",
    63: "meme-63.png",
    64: "meme-64.png",
    65: "meme-65.png",
    66: "meme-66.png",
    67: "meme-67.png",
    68: "meme-68.png",
    69: "meme-69.png",
    70: "meme-70.png",
    71: "meme-71.png",
    72: "meme-72.png",
    73: "meme-73.png",
    74: "meme-74.png",
    75: "meme-75.png",
    76: "meme-76.png",
    77: "meme-77.png",
    78: "meme-78.png",
    79: "meme-79.png",
    80: "meme-80.png",
    81: "meme-81.png",
    82: "meme-82.png",
    83: "meme-83.png",
    84: "meme-84.png",
    85: "meme-85.png",
    86: "meme-86.png",
    87: "meme-87.png",
    88: "meme-88.png",
    89: "meme-89.png",
    90: "meme-90.png",
    91: "meme-91.png",
    92: "meme-92.png",
    93: "meme-93.png",
    94: "meme-94.png",
    95: "meme-4.png",
    96: "meme-96.png",
    97: "meme-97.png",
    98: "meme-98.png",
    99: "meme-99.png",
    100: "meme-100.png",
};

export const AirdropTable: React.FC<AirdropTableProps> = ({
    scores,
    loaderRef,
    isFetchingNextPage,
    hasNextPage,
    onSearch,
    isSearching,
}) => {
    return (
        <div className="">
            <table className="max-w-xl rounded-b-lg overflow-hidden table-auto bg-blue-300 text-black-900 w-full text-sm text-gray-500">
                <thead className="uppercase text-black-300 bg-gray-50 border-b border-purple-300 text-sm">
                    <tr>
                        <th className="py-3 w-14 lg:w-20 text-center">Place</th>
                        <th className="py-2 px-2 max-w-16">
                            <div className="flex items-center gap-1 md:gap-3 lg:gap-4">
                                <span className="whitespace-nowrap text-sm">Name</span>
                                <div className="relative w-24 md:w-32 lg:w-40">
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        onChange={(e) => onSearch(e.target.value)}
                                        className="w-full px-2 py-1 text-sm outline-none text-p5 bg-white rounded-full border border-purple-300"
                                    />
                                    {isSearching && (
                                        <div className="absolute inset-y-0 left-2 flex items-center">
                                            <Loader />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </th>
                        <th className="py-3 px-2 text-center max-w-2">Tails Score</th>
                    </tr>
                </thead>

                <tbody>
                    {scores.map((result, index) => (
                        <tr
                            key={index}
                            className={`border-b ${index > 2 ? "border-purple-300" : "border-yellow-300"
                                }`}
                        >
                            <th
                                scope="row"
                                className={`text-p6 md:text-p4 uppercase font-secondary text-center py-4 font-medium whitespace-nowrap border-b ${index > 2
                                    ? "bg-white border-purple-300"
                                    : "bg-yellow-300 border-white"
                                    }`}
                            >
                                #{index + 1}
                            </th>
                            <td
                                className={`py-4 px-10 lg:px-20 bg-gray-700 text-p6 md:text-p4 border-l relative font-bold ${index > 2
                                    ? "border-purple-300 text-purple-300"
                                    : "border-yellow-300 text-yellow-300"
                                    }`}
                            >
                                <a
                                    className="cursor-pointer"
                                    href={`https://x.com/${result.username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {memeCats[index + 1] && (
                                        <img
                                            src={`meme-cats/${memeCats[index + 1]}`}
                                            className="w-8 lg:w-12 left-0 translate-x-2 -translate-y-2 lg:translate-x-4 absolute"
                                            alt={`meme-${index + 1}`}
                                        />
                                    )}

                                    {result.username}
                                </a>
                            </td>
                            <td
                                className={`p-4 text-center bg-gray-700 text-p6 md:text-p4 border-l font-secondary ${index > 2
                                    ? "border-purple-300 text-purple-300"
                                    : "border-yellow-300 text-yellow-300"
                                    }`}
                            >
                                {result.totalScore}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div ref={loaderRef} className="flex justify-center mt-6">
                {isFetchingNextPage && <Loader />}
            </div>

            {!isFetchingNextPage && !hasNextPage && (
                <NoMore
                    title="That's everyone!"
                    subtitle="Keep an eye out for more drops."
                />
            )}
        </div>
    );
};
