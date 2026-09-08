import { useRef, useState, type SVGProps } from "react";
import { MediaPlayer, MediaProvider, PlayButton, useMediaState } from "@vidstack/react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/base.css";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

function icon(path: string) {
  return function PlayerIcon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg {...props} viewBox="0 0 24 24" fill="none">
        <path
          d={path}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };
}

const PlayIcon = icon("M16.6582 9.28638C18.098 10.1862 18.8178 10.6361 19.0647 11.2122C19.2803 11.7152 19.2803 12.2847 19.0647 12.7878C18.8178 13.3638 18.098 13.8137 16.6582 14.7136L9.896 18.94C8.29805 19.9387 7.49907 20.4381 6.83973 20.385C6.26501 20.3388 5.73818 20.0469 5.3944 19.584C5 19.053 5 18.1108 5 16.2264V7.77357C5 5.88919 5 4.94701 5.3944 4.41598C5.73818 3.9531 6.26501 3.66111 6.83973 3.6149C7.49907 3.5619 8.29805 4.06126 9.896 5.05998L16.6582 9.28638Z");
const PauseIcon = icon("M8 5V19M16 5V19");
const VolumeHighIcon = icon("M16.0004 9.00009C16.6281 9.83575 17 10.8745 17 12.0001C17 13.1257 16.6281 14.1644 16.0004 15.0001M18 5.29177C19.8412 6.93973 21 9.33459 21 12.0001C21 14.6656 19.8412 17.0604 18 18.7084M4.6 9.00009H5.5012C6.05213 9.00009 6.32759 9.00009 6.58285 8.93141C6.80903 8.87056 7.02275 8.77046 7.21429 8.63566C7.43047 8.48353 7.60681 8.27191 7.95951 7.84868L10.5854 4.69758C11.0211 4.17476 11.2389 3.91335 11.4292 3.88614C11.594 3.86258 11.7597 3.92258 11.8712 4.04617C12 4.18889 12 4.52917 12 5.20973V18.7904C12 19.471 12 19.8113 11.8712 19.954C11.7597 20.0776 11.594 20.1376 11.4292 20.114C11.239 20.0868 11.0211 19.8254 10.5854 19.3026L7.95951 16.1515C7.60681 15.7283 7.43047 15.5166 7.21429 15.3645C7.02275 15.2297 6.80903 15.1296 6.58285 15.0688C6.32759 15.0001 6.05213 15.0001 5.5012 15.0001H4.6C4.03995 15.0001 3.75992 15.0001 3.54601 14.8911C3.35785 14.7952 3.20487 14.6422 3.10899 14.4541C3 14.2402 3 13.9601 3 13.4001V10.6001C3 10.04 3 9.76001 3.10899 9.54609C3.20487 9.35793 3.35785 9.20495 3.54601 9.10908C3.75992 9.00009 4.03995 9.00009 4.6 9.00009Z");
const VolumeLowIcon = icon("M18 9.00009C18.6277 9.83575 18.9996 10.8745 18.9996 12.0001C18.9996 13.1257 18.6277 14.1644 18 15.0001M6.6 9.00009H7.5012C8.05213 9.00009 8.32759 9.00009 8.58285 8.93141C8.80903 8.87056 9.02275 8.77046 9.21429 8.63566C9.43047 8.48353 9.60681 8.27191 9.95951 7.84868L12.5854 4.69758C13.0211 4.17476 13.2389 3.91335 13.4292 3.88614C13.594 3.86258 13.7597 3.92258 13.8712 4.04617C14 4.18889 14 4.52917 14 5.20973V18.7904C14 19.471 14 19.8113 13.8712 19.954C13.7597 20.0776 13.594 20.1376 13.4292 20.114C13.239 20.0868 13.0211 19.8254 12.5854 19.3026L9.95951 16.1515C9.60681 15.7283 9.43047 15.5166 9.21429 15.3645C9.02275 15.2297 8.80903 15.1296 8.58285 15.0688C8.32759 15.0001 8.05213 15.0001 7.5012 15.0001H6.6C6.03995 15.0001 5.75992 15.0001 5.54601 14.8911C5.35785 14.7952 5.20487 14.6422 5.10899 14.4541C5 14.2402 5 13.9601 5 13.4001V10.6001C5 10.04 5 9.76001 5.10899 9.54609C5.20487 9.35793 5.35785 9.20495 5.54601 9.10908C5.75992 9.00009 6.03995 9.00009 6.6 9.00009Z");
const MutedIcon = icon("M16 9.50009L21 14.5001M21 9.50009L16 14.5001M4.6 9.00009H5.5012C6.05213 9.00009 6.32759 9.00009 6.58285 8.93141C6.80903 8.87056 7.02275 8.77046 7.21429 8.63566C7.43047 8.48353 7.60681 8.27191 7.95951 7.84868L10.5854 4.69758C11.0211 4.17476 11.2389 3.91335 11.4292 3.88614C11.594 3.86258 11.7597 3.92258 11.8712 4.04617C12 4.18889 12 4.52917 12 5.20973V18.7904C12 19.471 12 19.8113 11.8712 19.954C11.7597 20.0776 11.594 20.1376 11.4292 20.114C11.239 20.0868 11.0211 19.8254 10.5854 19.3026L7.95951 16.1515C7.60681 15.7283 7.43047 15.5166 7.21429 15.3645C7.02275 15.2297 6.80903 15.1296 6.58285 15.0688C6.32759 15.0001 6.05213 15.0001 5.5012 15.0001H4.6C4.03995 15.0001 3.75992 15.0001 3.54601 14.8911C3.35785 14.7952 3.20487 14.6422 3.10899 14.4541C3 14.2402 3 13.9601 3 13.4001V10.6001C3 10.04 3 9.76001 3.10899 9.54609C3.20487 9.35793 3.35785 9.20495 3.54601 9.10908C3.75992 9.00009 4.03995 9.00009 4.6 9.00009Z");
const ExpandIcon = icon("M14 10L21 3M21 3H16.5M21 3V7.5M10 14L3 21M3 21H7.5M3 21L3 16.5");
const CompressIcon = icon("M14 10L21 3M14 10H18.5M14 10V5.5M10 14L3 21M10 14H5.5M10 14L10 18.5");

const playerIcons = {
  ...defaultLayoutIcons,
  PlayButton: { Play: PlayIcon, Pause: PauseIcon, Replay: PlayIcon },
  MuteButton: { Mute: MutedIcon, VolumeLow: VolumeLowIcon, VolumeHigh: VolumeHighIcon },
  FullscreenButton: { Enter: ExpandIcon, Exit: CompressIcon },
};

function ClickToPlay() {
  const paused = useMediaState("paused");
  if (!paused) return null;

  return (
    <PlayButton
      aria-label="Play video"
      className="absolute inset-0 z-1 cursor-interactive bg-transparent"
    />
  );
}

export interface DocVideoClientProps {
  src: string;
  title?: string;
}

/**
 * The box takes 16/9 until the clip reports its own size, then corrects. The
 * site probed the header ahead of time because the clip came over the network;
 * here it is a file on this machine, so metadata arrives in the same frame and
 * a probe would only cost a read for nothing.
 *
 * The surface carries a pointer cursor in both play states, and only one
 * video plays at a time: starting one pauses every other player on the page.
 */
export default function DocVideoClient({ src, title }: DocVideoClientProps) {
  const [ratio, setRatio] = useState("16 / 9");
  const boxRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={boxRef}
      className="markdown-media isolate my-4 bg-muted cursor-interactive"
      style={{ aspectRatio: ratio }}
      onLoadedMetadataCapture={(e) => {
        const video = e.currentTarget.querySelector("video");
        if (video?.videoWidth && video?.videoHeight) {
          setRatio(`${video.videoWidth} / ${video.videoHeight}`);
        }
      }}
    >
      <MediaPlayer
        className="markdown-video relative"
        style={{ width: "100%", height: "100%" }}
        src={{ src, type: "video/webm" }}
        title={title || "Documentation video"}
        viewType="video"
        streamType="on-demand"
        playsInline
        preload="metadata"
        onPlay={() => {
          // The clip elements are the register, so nothing has to be kept in
          // step with them. A player instance is not stable enough to compare:
          // the ref is swapped after mount, so a set of instances made every
          // player pause itself the moment it started.
          const mine = boxRef.current?.querySelector("video");
          for (const other of document.querySelectorAll("video")) {
            if (other !== mine) other.pause();
          }
        }}
      >
        <MediaProvider />
        <ClickToPlay />
        <DefaultVideoLayout
          colorScheme="dark"
          icons={playerIcons}
          slots={{
            chapterTitle: null,
            googleCastButton: null,
            pipButton: null,
            settingsMenu: null,
            beforeFullscreenButton: <div className="vds-controls-spacer" />,
          }}
        />
      </MediaPlayer>
    </div>
  );
}
