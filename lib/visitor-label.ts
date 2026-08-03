const GIVEN = "Ada Aiden Alma Anya Arlo Avery Bea Blaise Calla Cian Cleo Daria Dorian Elio Ellis Esme Faye Felix Flora Gale Gus Hana Hollis Ivo Jules Kai Leila Lio Mara Mila Nia Oren Pia Quinn Rafi Remi Sacha Sage Talia Theo Uma Vale Vera Willa Xan Yara Zev Aster Briar Cora Devin Eden Fia Greer Iris Juno Kira Lark Miro Nell Orla Rowan Soren Tessa".split(" ");
const FAMILY = "Alden Amery Ashby Baird Bellamy Birch Blythe Briar Calder Callow Carden Carver Dawes Dune Everly Evers Fairchild Farrow Finch Frost Gable Gray Greer Hale Harlow Hart Ingram Ives Jory Keane Kestrel Kingsley Lane Linden Marlow Mercer Merritt Monroe Naylor Noble North Oakley Orson Pallas Perrin Quinn Rainer Reed Rowan Sable Sayer Sloan Solace Sterling Tate Vale Vesper Waverly West Wren York Zephyr Wells Avery".split(" ");

/** A stable, non-identifying label for one hashed visitor. */
export function visitorLabel(visitor: string): string {
  let hash = 0;
  for (let i = 0; i < visitor.length; i++) hash = (hash * 31 + visitor.charCodeAt(i)) >>> 0;
  const second = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return `${GIVEN[hash % GIVEN.length]} ${FAMILY[second % FAMILY.length]}`;
}