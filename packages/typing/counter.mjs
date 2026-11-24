// Deliberately accepts no event argument. Only the count survives the callback.
export function createCounter(){let count=0;return {increment:()=>{count++;},take:()=>{const value=count;count=0;return value;}};}
