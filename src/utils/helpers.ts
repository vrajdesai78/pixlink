"use server";

import PinataClient from "@pinata/sdk";
import OpenAI from "openai";

async function imageUrlToFile(
  imageUrl: string,
  fileName: string
): Promise<File> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Network response was not ok");
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type });
  } catch (error) {
    console.error("Error converting image URL to File:", error);
    throw error;
  }
}

const uploadFile = async (prompt: string) => {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_KEY!,
      dangerouslyAllowBrowser: true,
    });

    const aiResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
    });
    const imageUrl = aiResponse.data[0].url;

    const file = await imageUrlToFile(imageUrl!, "pixlink.png");

    const data = new FormData();
    data.append("file", file);
    const response = await fetch(`${process.env.BASE_URL}/files`, {
      method: "POST",
      body: data,
    });
    const resData = await response.json();
    return `https://ipfs.moralis.io:2053/ipfs/${resData.IpfsHash}`;
  } catch (e) {
    console.log(e);
  }
};

const uploadMetadata = async (url: string, creator: string) => {
  const pinata = new PinataClient({ pinataJWTKey: process.env.PINATA_JWT });
  const result = await pinata.pinJSONToIPFS({
    name: "PixLink",
    description: "PixLink NFT",
    symbol: "PXL",
    image: url,
    seller_fee_basis_points: 500,
    properties: {
      files: [
        {
          uri: url,
          type: "image/jpg",
        },
      ],
      creators: [
        {
          address: creator,
          share: 100,
        },
      ],
    },
  });
  return `https://ipfs.moralis.io:2053/ipfs/${result.IpfsHash}`;
};

export { uploadFile, uploadMetadata };
