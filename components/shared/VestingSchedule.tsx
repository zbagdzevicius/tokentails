import React from "react";

export const VestingSchedule = () => {
  return (
    <div className="overflow-x-scroll">
      <table className="rounded-lg overflow-hidden table-auto bg-blue-300 text-black-900 w-full text-sm text-left text-gray-500 max-xl:ml-8 max-xl:mr-8">
        <thead className="text-p5 uppercase text-black-300 bg-gray-50 border-b border-purple-300">
          <tr>
            <th className="py-3 px-6"></th>
            <th className="py-3 text-center">ALLOCATION</th>
            <th className="py-3 px-6 text-center">TGE</th>
            <th className="py-3 px-6 text-center">price</th>
            <th className="py-3 px-6 text-end border-l border-blue-300">1</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">2</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">3</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">4</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">5</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">6</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">6</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">7</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">9</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">10</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">11</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">12</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">13</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">14</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">15</th>
            <th className="py-3 px-6 text-center border-l border-blue-300">...</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-purple-300">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium bg-purple-300 whitespace-nowrap border-b border-white"
            >
              SEED
            </th>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4">
              4%
            </td>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4 border-l border-purple-300">
              5%
            </td>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4 border-l border-purple-300">
              $0.01
            </td>
            <td colSpan={3} className="text-center border border-purple-300">
              CLIFF
            </td>
            <td colSpan={13} className="py-4 px-6 bg-purple-300 text-left">
              LINEAR VEST - 18 MONTHS
            </td>
          </tr>
          <tr className="border-b border-purple-300">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium whitespace-nowrap bg-purple-300 border-b"
            >
              PRIVATE
            </th>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4">
              6%
            </td>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4 border-l border-purple-300">
              10%
            </td>
            <td className="py-4 px-6 text-center text-purple-300 bg-gray-700 text-p4 border-l border-purple-300">
              $0.02
            </td>
            <td colSpan={1} className="text-center border border-purple-300">
              CLIFF
            </td>
            <td colSpan={12} className="py-4 px-6 bg-purple-300 text-left">
              LINEAR VEST - 12 MONTHS
            </td>
          </tr>
          <tr className="border-b border-yellow-300">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium whitespace-nowrap bg-yellow-300 border-b border-white"
            >
              PUBLIC
            </th>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4">
              2%
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              25%
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              $0.03
            </td>
            <td colSpan={3} className="py-4 px-6 bg-yellow-300 text-left">
              LINEAR VEST - 3 MONTHS
            </td>
          </tr>
          <tr className="border-b border-yellow-300">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium whitespace-nowrap bg-yellow-300"
            >
              ADVISORS
            </th>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4">
              1.5%
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              0
            </td>
            <td className="py-4 px-6 text-center text-yellow-300 bg-gray-700 text-p4 border-l border-yellow-300">
              -
            </td>
            <td className="text-center border border-yellow-300" colSpan={3}>
              CLIFF
            </td>
            <td colSpan={10} className="py-4 px-6 bg-yellow-300 text-left">
              LINEAR VEST - 10 MONTHS
            </td>
          </tr>
          <tr className="border-b border-green-300">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium whitespace-nowrap bg-green-300 border-b border-white"
            >
              MARKETING
            </th>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4">
              10%
            </td>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4 border-l border-green-300">
              0
            </td>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4 border-l border-green-300">
              -
            </td>
            <td className="text-center border border-green-300" colSpan={4}>
              CLIFF
            </td>
            <td colSpan={12} className="py-4 px-6 bg-green-300 text-left">
              LINEAR VEST - 40 MONTHS
            </td>
          </tr>
          <tr className="border-b border-green-300">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium whitespace-nowrap bg-green-300"
            >
              REWARDS
            </th>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4">
              40%
            </td>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4 border-l border-green-300">
              0
            </td>
            <td className="py-4 px-6 text-center text-green-300 bg-gray-700 text-p4 border-l border-green-300">
              -
            </td>
            <td colSpan={1} className="text-center border border-green-300">
              CLIFF
            </td>
            <td colSpan={15} className="py-4 px-6 bg-green-300 text-left">
              LINEAR VEST - 50 MONTHS
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium whitespace-nowrap bg-white border-b border-yellow-300"
            >
              FOUNDATION
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4">
              33.5%
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              0
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              -
            </td>
            <td colSpan={5} className="text-center border border-white">
              CLIFF
            </td>
            <td colSpan={11} className="py-4 px-6 bg-white text-left">
              LINEAR VEST - 40 MONTHS
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium whitespace-nowrap bg-white border-b border-yellow-300"
            >
              LIQUIDITY
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4">
              3%
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              100%
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              -
            </td>
            <td colSpan={16} className="py-4 px-6 bg-white text-left">
              VESTED AT TGE
            </td>
          </tr>
          <tr className="border-b border-white">
            <th
              scope="row"
              className="text-p5 py-4 px-6 font-medium whitespace-nowrap bg-white"
            >
              MARKET CAP
            </th>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4">
              -
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p4 border-l border-white-300">
              $0.48M
            </td>
            <td className="py-4 px-6 text-center text-white bg-gray-700 text-p5 border-l border-white">
              -
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $0.6M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $1.2M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $1.7M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $2.2M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $2.6M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $3.1M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $3.7M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $4.2M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $4.7M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $5.3M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $5.9M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $6.4M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $7.3M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $7.9M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $8.5M
            </td>
            <td className="py-4 px-4 text-center text-white bg-gray-700 text-p5 border-l border-white">
              $30M
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
