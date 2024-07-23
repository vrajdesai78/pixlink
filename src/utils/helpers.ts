"use server";

import PinataClient from "@pinata/sdk";
import { Transaction } from "@solana/web3.js";
import axios from "axios";
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

const buildList = async (mint: string, owner: string, price: string) => {
  const query = `
  query TcompListTx($mint: String!, $owner: String!, $price: Decimal!) {
    tcompListTx(mint: $mint, owner: $owner, price: $price) {
      txs {
        tx
      }
    }
  }
`;

  const variables = {
    mint,
    owner,
    price,
  };

  const requestData = {
    operationName: "TcompListTx",
    query: query,
    variables: variables,
  };

  let lsTxn: Transaction | undefined;

  axios
    .post("https://tensor.xnfts.dev/", requestData)
    .then(async (response) => {
      const txs = response.data.data.tcompListTx.txs[0].tx.data;
      const transaction = Transaction.from(Buffer.from(txs, "base64"));
      console.log('txn', transaction);
      lsTxn = transaction;
    })
    .catch((error) => {
      console.error("Error:", error);
    });

  return lsTxn;
};

export { uploadFile, uploadMetadata, buildList };
