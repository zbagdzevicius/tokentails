import React from "react";

export const VestingSchedule = () => {
  return (
    <div className="font-secondary hover:brightness-105 mt-8 animate-opacity">
      <table className="rounded-lg overflow-hidden table-auto bg-blue-300 text-black-900 w-full text-sm text-left text-gray-500 max-2xl:ml-2 max-2xl:mr-2">
        <thead className="text-p4 uppercase text-black-300 bg-gray-50 border-b border-purple-300 font-primary">
          <tr>
            <th className="py-3 px-6 font-primary">POOL</th>
            <th className="py-3 px-2 text-center font-primary">ALLOCATION</th>
            <th className="py-3 px-2 text-center font-primary">TGE UNLOCK</th>
            <th className="py-3 px-6 text-center border-l border-blue-300 relative bg-gray-50">
              <div className="absolute inset-0 top-3 flex items-center pr-2 rounded-t-lg text-[10px] font-primary leading-[10px] z-0 flex-col whitespace-nowrap px-1">
                months after <span className="text-p4">TGE</span>
              </div>
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center z-10">
                1
              </div>
            </th>

            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center">
                2
              </div>
            </th>

            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center">
                3
              </div>
            </th>

            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center">
                4
              </div>
            </th>

            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center">
                5
              </div>
            </th>

            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center">
                6
              </div>
            </th>

            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center">
                7
              </div>
            </th>

            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center">
                8
              </div>
            </th>
            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-1 bg-gray-50 flex items-center">
                9
              </div>
            </th>
            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-2 bg-gray-50 flex items-center">
                10
              </div>
            </th>
            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-2 bg-gray-50 flex items-center">
                11
              </div>
            </th>
            <th className="py-3 px-6 text-center border-l border-blue-300">
              ...
            </th>
          </tr>
        </thead>
        <tbody className="font-primary">
          <tr className="border-b border-purple-300">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium bg-purple-300 whitespace-nowrap border-b border-white"
            >
              SEED
            </th>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4">
              18%
            </td>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4 border-l border-purple-300">
              25%
            </td>
            <td
              colSpan={3}
              className="py-0 px-6 bg-purple-300 text-left text-p4"
            >
              <div className="flex flex-col items-center">
                <div className="text-p4">LINEAR VEST</div>
                <div className="text-p5 -mt-1">3 months</div>
              </div>
            </td>
          </tr>
          <tr className="border-b border-yellow-300">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-yellow-300 border-b border-white"
            >
              PRESALE
            </th>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4">
              26%
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              50%
            </td>
            <td
              colSpan={2}
              className="py-0 px-6 bg-yellow-300 text-left text-p4"
            >
              <div className="flex flex-col items-center">
                <div className="text-p4">LINEAR VEST</div>
                <div className="text-p5 -mt-1">2 months</div>
              </div>
            </td>
          </tr>
          <tr className="border-b border-yellow-300">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-yellow-300"
            >
              ADVISORS
            </th>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4">
              2%
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              0
            </td>
            <td
              className="text-center border border-yellow-300 text-p4"
              colSpan={9}
            >
              CLIFF
            </td>
            <td
              colSpan={3}
              className="py-0 px-6 bg-yellow-300 text-left text-p4"
            >
              <div className="flex flex-col items-center">
                <div className="text-p4">LINEAR VEST</div>
                <div className="text-p5 -mt-1">10 months</div>
              </div>
            </td>
          </tr>
          <tr className="border-b border-red-300">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-red-300 border-b border-white"
            >
              MARKETING
            </th>
            <td className="py-4 px-6 text-center text-red-300 bg-gray-700 text-p4">
              10%
            </td>
            <td className="py-4 px-6 text-center text-red-300 bg-gray-700 text-p4 border-l border-red-300">
              25%
            </td>
            <td className="text-center border border-red-300 text-p4">CLIFF</td>
            <td className="text-center bg-red-300 text-p4">VEST</td>
            <td className="text-center border border-red-300 text-p4">CLIFF</td>
            <td className="text-center bg-red-300 text-p4">VEST</td>
            <td className="text-center border border-red-300 text-p4">CLIFF</td>
            <td className="text-center bg-red-300 text-p4">VEST</td>
          </tr>
          <tr className="border-b border-red-300">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-red-300"
            >
              REWARDS
            </th>
            <td className="py-4 px-6 text-center text-red-300 bg-gray-700 text-p4">
              25%
            </td>
            <td className="py-4 px-6 text-center text-red-300 bg-gray-700 text-p4 border-l border-red-300">
              20%
            </td>
            <td
              colSpan={3}
              className="text-center border border-red-300 text-p4"
            >
              CLIFF
            </td>
            <td colSpan={1} className="py-4 px-2 bg-red-300 text-left text-p4">
              AIRDROP
            </td>
            <td
              colSpan={3}
              className="text-center border border-red-300 text-p4"
            >
              CLIFF
            </td>
            <td colSpan={1} className="py-4 px-2 bg-red-300 text-left text-p4">
              AIRDROP
            </td>
            <td
              colSpan={3}
              className="text-center border border-red-300 text-p4"
            >
              CLIFF
            </td>
            <td colSpan={1} className="py-4 px-2 bg-red-300 text-left text-p4">
              AIRDROP
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-green-300 border-b border-white"
            >
              FOUNDATION
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4">
              12%
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white">
              0
            </td>
            <td colSpan={3} className="text-center border border-white text-p4">
              CLIFF
            </td>
            <td colSpan={9} className="px-6 bg-green-300 text-left text-p4">
              <div className="flex flex-col items-center">
                <div className="text-p4">LINEAR VEST</div>
                <div className="text-p5 -mt-1">20 months</div>
              </div>
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-green-300 border-b border-yellow-300"
            >
              LIQUIDITY
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4">
              7%
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              100%
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-white flex flex-col"
            >
              <span>MARKET CAP</span>
              <span className="text-p6 -mt-2">INCL. LIQUIDITY</span>
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              $1.1m
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white">
              32%
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $1.1m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $1.5m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $1.9m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.1m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.3m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.4m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.4m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.5m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.6m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.6m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.6m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.7m
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
