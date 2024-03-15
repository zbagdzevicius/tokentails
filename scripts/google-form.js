import { googleFormsToJson } from 'react-google-forms-hooks'

// can use both full and shortened form url
const result = await googleFormsToJson(
  'https://docs.google.com/forms/d/1t655ZwPH78iL4COkrsG0ApM5KAXdWDwmaYuyGKR9RdQ/viewform'
)

console.log(result)