// Each world keeps its art in assets/images/worlds/<slug>/: scene.webp (2:3 portrait
// scenery) and board.webp (square sheet of board materials). Only URLs are bundled
// eagerly; the images load when their world first appears.
const scenes = import.meta.glob<string>('../assets/images/worlds/*/scene.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const boards = import.meta.glob<string>('../assets/images/worlds/*/board.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Scenery of a world, or undefined while it has none and shows the drawn gradient. */
export const sceneURL = (slug: string): string | undefined => scenes[`../assets/images/worlds/${slug}/scene.webp`];

/** Board material sheet of a world, or undefined while it has none and uses drawn sockets. */
export const boardURL = (slug: string): string | undefined => boards[`../assets/images/worlds/${slug}/board.webp`];
