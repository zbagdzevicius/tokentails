function formatArray(arr) {
  const chunkSize = 10;
  const result = [];

  arr.forEach((subArray) => {
    const subResult = [];
    for (let i = 0; i < subArray.length; i += chunkSize) {
      const chunk = subArray.slice(i, i + chunkSize).join(", ");
      subResult.push(`${chunk}`);
    }
    result.push(subResult);
  });

  return result;
}

const data = [
  [8, 0, 0, 8, 0, 0, 0, 0, 0, 100,
            37, 0, 0, 37, 0, 0, 2, 3, 3, 7,
            37, 0, 0, 37, 0, 0, 0, 0, 0, 37,
            37, 0, 0, 37, 0, 0, 0, 0, 0, 37,
            37, 0, 0, 66, 0, 0, 8, 0, 0, 37,
            37, 0, 0, 0, 0, 0, 37, 0, 0, 37,
            37, 0, 0, 0, 0, 0, 37, 0, 0, 37,
            63, 3, 3, 3, 3, 3, 65, 0, 0, 66],
   [5, 71, 0, 0, 0, 0, 0, 0, 101, 7,
            34, 0, 0, 0, 0, 0, 0, 0, 0, 36,
            34, 0, 0, 0, 0, 0, 0, 0, 0, 36,
            34, 0, 0, 0, 0, 0, 0, 0, 0, 36,
            34, 71, 0, 0, 0, 0, 0, 0, 0, 36,
            34, 0, 0, 0, 0, 0, 0, 0, 101, 36,
            34, 0, 0, 0, 0, 0, 0, 0, 0, 36,
            63, 0, 0, 0, 0, 0, 0, 0, 0, 65]

]

console.log(formatArray(data));
