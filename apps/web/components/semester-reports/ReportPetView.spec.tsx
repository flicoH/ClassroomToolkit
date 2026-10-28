import { existsSync, readdirSync } from "node:fs";
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

  it("contains 23 pets across four series and uses every physical form asset", () => {
    expect(petOptions).toHaveLength(23);
    expect(new Set(petOptions.map(pet => pet.id)).size).toBe(petOptions.length);

    const seriesCounts = {
      萌芽系: petOptions.filter(p => p.family === "萌芽系").length,
      焰岩系: petOptions.filter(p => p.family === "焰岩系").length,
      潮汐系: petOptions.filter(p => p.family === "潮汐系").length,
      星辉系: petOptions.filter(p => p.family === "星辉系").length
    };

    expect(seriesCounts).toEqual({
      萌芽系: 6,
      焰岩系: 6,
      潮汐系: 6,
      星辉系: 5
    });

    const spriteDirectory = resolve(process.cwd(), "public/pets/starling");
    const usedAssets = new Set<string>();

    for (const pet of petOptions) {
      expect(pet.evolutions).toHaveLength(4);
      expect(pet.description.length).toBeGreaterThan(10);

      // Each pair of growth levels shares one physical form, for four images per pet.
      for (const stageIndex of [1, 3, 5, 7]) {
        const html = renderToStaticMarkup(<PetSprite pet={pet} stageIndex={stageIndex} />);
        const assetName = /src="\/pets\/starling\/([^"]+\.png)"/.exec(html)?.[1];
        expect(assetName).toBeDefined();
        const assetPath = resolve(spriteDirectory, assetName!);
        expect(existsSync(assetPath)).toBe(true);
        usedAssets.add(assetName!);
      }
    }

    expect(usedAssets.size).toBe(petOptions.length * 4);
    expect(
      readdirSync(spriteDirectory)
        .filter(file => file.endsWith(".png"))
        .sort()
    ).toEqual([...usedAssets].sort());
  });
});
