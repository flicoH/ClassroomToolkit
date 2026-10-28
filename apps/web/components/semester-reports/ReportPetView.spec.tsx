import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PetSprite, petOptions } from "./ReportPetView";

describe("PetSprite", () => {
  it.each([
    ["ash-lion", 1, "ash-lion-clean"],
    ["ash-lion", 3, "ash-lion-2-clean"],
    ["bubble-otter", 3, "bubble-otter-2-clean"],
    ["coal-tail-fox", 3, "coal-tail-fox-2-clean"],
    ["coal-tail-fox", 5, "coal-tail-fox-3-clean"],
    ["coal-tail-fox", 7, "coal-tail-fox-4-clean"],
    ["coral-whale", 3, "coral-whale-2-clean"],
    ["coral-whale", 5, "coral-whale-3-clean"],
    ["pinecone-puff", 3, "pinecone-puff-2-clean"],
    ["red-sand-tortoise", 3, "red-sand-tortoise-2-clean"],
    ["red-sand-tortoise", 5, "red-sand-tortoise-3-hotfix"],
    ["star-sprout-marten", 3, "star-sprout-marten-2-clean"],
    ["vine-wing-bird", 3, "vine-wing-bird-2-clean"],
    ["vine-wing-bird", 5, "vine-wing-bird-3-clean"]
  ])("routes %s stage %i through its cleaned sprite", (petId, stageIndex, assetName) => {
    const pet = petOptions.find(option => option.id === petId);
    expect(pet).toBeDefined();

    const html = renderToStaticMarkup(<PetSprite pet={pet!} stageIndex={Number(stageIndex)} />);

    expect(html).toContain(`/pets/starling/${assetName}.png`);
    expect(existsSync(resolve(process.cwd(), "public/pets/starling", `${assetName}.png`))).toBe(true);
  });

  it("keeps unaffected stage assets unchanged", () => {
    const fox = petOptions.find(option => option.id === "star-compass-fox");
    expect(fox).toBeDefined();
    const html = renderToStaticMarkup(<PetSprite pet={fox!} stageIndex={5} />);

    expect(html).toContain("/pets/starling/star-compass-fox-3.png");
  });
});
