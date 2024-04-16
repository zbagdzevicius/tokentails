function customHash(inputString: string) {
    let hash = 0;
    if (inputString.length === 0) return hash;

    for (let i = 0; i < inputString.length; i++) {
        const char = inputString.charCodeAt(i);
        hash = (hash << 5) ^ (hash >> 27) ^ char;
    }

    return hash;
}

let lastGeneratedNumber = 5; // Initialize with the minimum allowed value
const MAX_ALLOWED_NUMBER = 100; // Maximum allowed number (exclusive)

export function getRandomNumber(inputString: string, inputDate: Date) {
    // Extract the month and date components from the inputDate
    const inputMonth = (inputDate.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
    const inputDay = inputDate.getDate().toString().padStart(2, '0');

    // Construct a date string using the extracted month and date
    const inputDateStr = `2023-${inputMonth}-${inputDay}`;

    const dateValue = new Date(inputDateStr).getTime();

    // Combine the hashed inputString and dateValue
    const combinedValue = (customHash(inputString) & 0x7fffffff) + dateValue;

    // Ensure the result is between 100 and 999 (inclusive)
    const resultInRange = (combinedValue % (MAX_ALLOWED_NUMBER - 10)) + 10;

    // Update lastGeneratedNumber
    lastGeneratedNumber = resultInRange + 1;

    return resultInRange;
}
