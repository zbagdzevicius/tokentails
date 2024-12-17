import React from "react";

export const VestingSchedule = () => {
  return (
    <div className="overflow-x-scroll font-secondary hover:brightness-105 hover:animate-hover">
      <table className="rounded-lg overflow-hidden table-auto bg-blue-300 text-black-900 w-full text-sm text-left text-gray-500 max-2xl:ml-2 max-2xl:mr-2">
        <thead className="text-p4 uppercase text-black-300 bg-gray-50 border-b border-purple-300">
          <tr>
            <th className="py-3 px-6"></th>
            <th className="py-3 text-center">ALLOCATION</th>
            <th className="py-3 px-6 text-center">TGE</th>
            <th className="py-3 px-6 text-center">price</th>
            <th className="py-3 px-6 text-center border-l border-blue-300 relative bg-gray-50">
              <div className="absolute inset-0 flex items-center pr-2 rounded-t-lg text-[10px] font-primary leading-[10px] z-0">
                months after TGE
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
            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-2 bg-gray-50 flex items-center">
                12
              </div>
            </th>
            <th className="py-3 px-6 text-center border-l border-blue-300 relative">
              <div className="absolute top-0 bottom-4 pt-2 -right-2 bg-gray-50 flex items-center">
                13
              </div>
            </th>
            <th className="py-3 px-6 text-center border-l border-blue-300">...</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-purple-300">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium bg-purple-300 whitespace-nowrap border-b border-white"
            >
              SEED
            </th>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4">
              8%
            </td>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4 border-l border-purple-300">
              15%
            </td>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4 border-l border-purple-300">
              $0.02
            </td>
            <td colSpan={2} className="text-center border border-purple-300 text-p4">
              CLIFF
            </td>
            <td colSpan={12} className="py-4 px-6 bg-purple-300 text-left text-p4">
              LINEAR VEST - 15 MONTHS
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
              29%
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              30%
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              $0.03
            </td>
            <td colSpan={8} className="py-4 px-6 bg-yellow-300 text-left text-p4">
              LINEAR VEST - 8 MONTHS
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
              1%
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              0
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              -
            </td>
            <td className="text-center border border-yellow-300 text-p4" colSpan={9}>
              CLIFF
            </td>
            <td colSpan={5} className="py-4 px-6 bg-yellow-300 text-left text-p4">
              LINEAR VEST - 14 MONTHS
            </td>
          </tr>
          <tr className="border-b border-green-300">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-green-300 border-b border-white"
            >
              MARKETING
            </th>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4">
              6%
            </td>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4 border-l border-green-300">
              0
            </td>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4 border-l border-green-300">
              -
            </td>
            <td className="text-center border border-green-300 text-p4" colSpan={8}>
              CLIFF
            </td>
            <td colSpan={6} className="py-4 px-6 bg-green-300 text-left text-p4">
              LINEAR VEST - 58 MONTHS
            </td>
          </tr>
          <tr className="border-b border-green-300">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-green-300"
            >
              REWARDS
            </th>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4">
              25%
            </td>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4 border-l border-green-300">
              0
            </td>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4 border-l border-green-300">
              -
            </td>
            <td colSpan={1} className="text-center border border-green-300 text-p4">
              CLIFF
            </td>
            <td colSpan={13} className="py-4 px-6 bg-green-300 text-left text-p4">
              LINEAR VEST - 64 MONTHS
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-white border-b border-yellow-300"
            >
              FOUNDATION
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4">
              15%
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              0
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              -
            </td>
            <td colSpan={13} className="text-center border border-white text-p4">
              17 months CLIFF
            </td>
            <td colSpan={1} className="px-6 bg-white text-left text-p4">
              <div className="flex flex-col items-center">
                <div className="text-p4">LINEAR VEST</div>
                <div className="text-p6">50 months</div>
                </div>
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-white border-b border-yellow-300"
            >
              LIQUIDITY
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4">
              16%
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              29%
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              -
            </td>
            <td colSpan={14} className="py-4 px-6 bg-white text-left text-p4">
              LINEAR VESTING
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p4 py-4 px-6 font-medium whitespace-nowrap bg-white flex flex-col"
            >
              <span>MARKET CAP</span>
              <span className="text-p6">INCL. LIQUIDITY</span>
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4">
              -
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              $0.3m
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white">
              -
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.3m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.35m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.41m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.49m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.56m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.64m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.72m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.8m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.87m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.9m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.93m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.96m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $0.99m
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p4 border-l border-white">
              $2.07m
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
