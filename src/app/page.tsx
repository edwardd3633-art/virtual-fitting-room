import Link from "next/link";
import { HeroStage } from "@/components/HeroStage";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow rise">Virtual fitting room · prototype</p>
          <h1 className="rise d1">
            See it on <span className="gradient-text">you.</span>
          </h1>
          <p className="lede rise d2">
            Build an avatar from your measurements, then try garments on it and switch between sizes to compare.
          </p>
          <div className="actions rise d3">
            <Link className="button-link primary" href="/avatar">
              Create my avatar
            </Link>
            <Link className="button-link" href="/catalog">
              Browse the catalog
            </Link>
          </div>
        </div>
        <div className="rise d2">
          <HeroStage />
        </div>
      </section>

      <ol className="features">
        <li className="feature">
          <span className="num gradient-text">01</span>
          <h2>Create your avatar</h2>
          <p>Enter six measurements in centimetres or inches. It&apos;s saved in this browser only.</p>
        </li>
        <li className="feature">
          <span className="num gradient-text">02</span>
          <h2>Pick a garment</h2>
          <p>Choose a product, colour and size from the demo catalog.</p>
        </li>
        <li className="feature">
          <span className="num gradient-text">03</span>
          <h2>Compare sizes</h2>
          <p>Switch sizes and orbit the view. Your avatar stays the same; areas where a size is smaller than you are highlighted.</p>
        </li>
      </ol>

      <section className="callout">
        <h2>What this prototype does and doesn&apos;t do</h2>
        <ul>
          <li>The avatar is a sculpted mannequin shaped by your measurements, not a calibrated body scan.</li>
          <li>Garments are fictional demo items with a separate 3D shape for each size. They aren&apos;t real retail products.</li>
          <li>Garments are settled onto the avatar geometrically, without fabric simulation, so there&apos;s no real drape, stretch, or movement.</li>
          <li>Nothing here predicts fit or comfort or recommends a size.</li>
        </ul>
      </section>
    </>
  );
}
