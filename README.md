# svelte-attach-sound

A Svelte attachment for binding sound playback to DOM events using the [Svelte 5 attachments API](https://svelte.dev/docs/svelte/attachments).

You can find CC-Zero licensed sounds at [freesound.org](https://freesound.org/)

## Example

```svelte
<script lang="ts">
  import { sound, useSound } from "svelte-attach-sound";
  import click_mp3 from "$lib/assets/click.mp3";

  const click = useSound(click_mp3, ["pointerdown"]);
</script>

<!-- Inline -->
<button {@attach sound({ src: click_mp3, events: ["click"] })}>Click</button>
<button {@attach sound({ src: click_mp3, events: ["mouseenter"] })}>Enter</button>

<!-- Factory: reusable with shared defaults -->
<button {@attach click()}>Click</button>
<button {@attach click({ volume: 0.5 })}>Click (quieter)</button>
```

[Demo](https://joknoll.github.io/svelte-attach-sound/) | [npm](https://www.npmjs.com/package/svelte-attach-sound)
