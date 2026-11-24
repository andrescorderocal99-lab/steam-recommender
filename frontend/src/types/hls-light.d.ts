// hls.js/light exposes the same API as hls.js but ships no type declarations of its own.
declare module 'hls.js/light' {
  import Hls from 'hls.js'
  export default Hls
}
