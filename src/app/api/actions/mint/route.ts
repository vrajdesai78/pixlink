import PinataClient from "@pinata/sdk";
import { Network, ShyftSdk } from "@shyft-to/js";
import {
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
} from "@solana/actions";
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import OpenAI from "openai";

const DEFAULT_SOL_ADDRESS: PublicKey = new PublicKey(
  "GqkJ3UoKTScvXiaJUxrGJ9QD847LAj2DTvMzqjaT2tJm"
);

function privateKeyToUint8Array(privateKeyString: string) {
  return new Uint8Array(bs58.decode(privateKeyString));
}

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

    const file = await imageUrlToFile(imageUrl!, "cute-cat.png");

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
    name: "BlinkPic",
    description: "BlinkPic NFT",
    symbol: "BLP",
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

export const GET = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const { toPubkey } = validatedQueryParams(requestUrl);

    const baseHref = new URL(
      `/api/actions/mint?to=${toPubkey}`,
      requestUrl.origin
    ).toString();

    const payload: ActionGetResponse = {
      title: "BlinkPic",
      icon: new URL("/blink.png", requestUrl.origin).toString(),
      description: "Generate customise BlinkPic Avatar",
      label: "Generate BlinkPic",
      links: {
        actions: [
          {
            label: "Enter your prompt", // button text
            href: `${baseHref}&prompt={prompt}`, // this href will have a text input
            parameters: [
              {
                name: "prompt",
                label: "Enter your prompt to generate BlinkPic",
                required: true,
              },
            ],
          },
        ],
      },
    };

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};

// DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
// THIS WILL ENSURE CORS WORKS FOR BLINKS
export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const { prompt, toPubkey } = validatedQueryParams(requestUrl);

    console.log("prompt", prompt);
    console.log("toPubkey", toPubkey);
    const body: ActionPostRequest = await req.json();

    // validate the client provided input
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return new Response('Invalid "account" provided', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }

    const secretKeyArray = privateKeyToUint8Array(process.env.PRIVATE_KEY!);

    const wallet = Keypair.fromSecretKey(secretKeyArray);

    const fileUrl = await uploadFile(prompt);

    console.log("fileUrl", fileUrl);

    const url = await uploadMetadata(fileUrl!, account.toBase58());

    const connection = new Connection(process.env.RPC_URL!);

    const transaction = new Transaction();

    const shyft = new ShyftSdk({
      apiKey: process.env.API_KEY!,
      network: Network.Mainnet,
    });

    const tx = await shyft.nft.compressed.mint({
      creatorWallet: "5uUf32tjr8ZJ5cQeYoNwq4nbz1dB5BshcFeyo6VwDSPQ",
      merkleTree: "FbdosWezrACU94Vuw9ZL8UJaj4wzthXxB3ZgiKf7F5N8",
      metadataUri: url,
      feePayer: account.toBase58(),
      maxSupply: 1,
      priorityFee: 1000,
      isMutable: true,
      receiver: account.toBase58(),
    });

    const decodedTxn = Transaction.from(
      Buffer.from(tx.encoded_transaction, "base64")
    );

    transaction.add(decodedTxn);

    const senderAccount = getAssociatedTokenAddressSync(
      new PublicKey("SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa"),
      account
    );

    const receiverAccount = getAssociatedTokenAddressSync(
      new PublicKey("SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa"),
      DEFAULT_SOL_ADDRESS
    );

    console.log("senderAccount", senderAccount.toBase58());
    console.log("receiverAccount", receiverAccount.toBase58());

    transaction.feePayer = account;

    const latestBlockhash = await connection.getLatestBlockhash();

    transaction!.recentBlockhash = latestBlockhash.blockhash;
    transaction!.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    transaction.add(
      createTransferInstruction(
        senderAccount,
        receiverAccount,
        account,
        69 * Math.pow(10, 6)
      )
    );

    transaction.partialSign(wallet);

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Minted BlinkPic`,
      },
    });

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};

function validatedQueryParams(requestUrl: URL) {
  let toPubkey: PublicKey = DEFAULT_SOL_ADDRESS;
  let prompt = "Cool cat, cartoonist, cute, glasses";

  try {
    if (requestUrl.searchParams.get("to")) {
      toPubkey = new PublicKey(requestUrl.searchParams.get("to")!);
    }
    if (requestUrl.searchParams.get("prompt")) {
      prompt = requestUrl.searchParams.get("prompt")!;
    }
  } catch (err) {
    throw "Invalid input query parameter: prompt";
  }

  return {
    prompt,
    toPubkey,
  };
}
