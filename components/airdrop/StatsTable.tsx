import { IDataRecord } from "@/models/quest";

export const StatsTable = ({
  title,
  records,
}: {
  title: string;
  records: IDataRecord[];
}) => {
  const keyValues = records.map((record) => {
    const key = Object.keys(record)[0];
    return {
      key,
      value: record[key],
    };
  });
  return (
    <div className="w-360 md:w-[240px]">
      <h2 className="text-center font-primary uppercase tracking-tight text-p2 text-balance px-4 py-4 md:py-0">
        <span className="text-yellow-300 drop-shadow-[0_2.4px_1.8px_rgba(0,0,0)] mr-4">
          WEEKLY
        </span>
        {title}
      </h2>
      <table className="max-w-xl m-auto w-full rounded-2xl overflow-hidden table-auto bg-blue-300 text-black-900 text-p4 text-gray-500 drop-shadow-[0_2.4px_1.2px_rgba(0,0,0,0.8)]">
        <thead className="uppercase text-black-300 bg-gray-50 border-b border-purple-300 text-p4">
          <tr>
            <th className="py-3 w-16 font-primary text-center">Week Start</th>
            <th className="py-3 px-2 text-center max-w-2 font-primary">
              Count
            </th>
          </tr>
        </thead>

        <tbody>
          {keyValues.map((keyValue, index) => (
            <tr
              key={index}
              className={`border-b ${
                index !== 0 ? "border-purple-300" : "border-yellow-300"
              }`}
            >
              <td
                className={`py-4 px-2 bg-gray-700 text-p4 border-l relative font-bold text-nowrap ${
                  index !== 0
                    ? "border-purple-300 text-purple-300"
                    : "border-yellow-300 text-yellow-300"
                }`}
              >
                {keyValue.key}
              </td>
              <td
                className={`p-4 px-2 text-center bg-gray-700 text-p2 border-l font-secondary ${
                  index !== 0
                    ? "border-purple-300 text-purple-300"
                    : "border-yellow-300 text-yellow-300"
                }`}
              >
                {keyValue.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
