<script lang="ts">
    import { Sound, sound, useSound } from "svelte-attach-sound";
    import click_mp3 from "$lib/assets/click.opus";
    import cheering from "$lib/assets/kids-cheering.opus";

    let count = $state(0);

    // Programmatic Sound instance — used without DOM events
    const clickSound = new Sound(click_mp3);

    function handleDoubleClick() {
        clickSound.play();
        setTimeout(() => {
            clickSound.play();
            count += 1;
        }, 125);
    }

    // Pre-configured attachment factory — reused across elements
    const click = useSound(click_mp3, ["click"]);
</script>

<section>
    <button
        onclick={() => count++}
        {@attach sound({ src: click_mp3, events: ["click"] })}
    >
        Attachment {count}
        (single click sound)
    </button>

    <button
        onclick={() => count++}
        {@attach sound({ src: click_mp3, events: ["click"], volume: 0.5 })}
    >
        Attachment {count}
        (single click sound, 0.5 volume)
    </button>

    <button onclick={() => count++} {@attach click()}>
        useSound factory {count}
        (single click sound, via useSound)
    </button>

    <button ondblclick={handleDoubleClick}>
        Manual Sound {count}
        (double click sound, programmatic)
    </button>

    <button
        onclick={() => count++}
        {@attach sound({
            src: cheering,
            events: ["mouseenter", "mouseleave"],
            volume: 0.2,
        })}
    >
        Attachment {count}
        (mouse enter/leave sound)
    </button>
</section>

<style>
    section {
        display: grid;
        place-content: center;

        height: 90svh;
    }

    button {
        margin: 1rem;
        padding: 1rem;
    }
</style>
