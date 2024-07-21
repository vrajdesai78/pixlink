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
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

const DEFAULT_SOL_ADDRESS: PublicKey = new PublicKey(
  "GqkJ3UoKTScvXiaJUxrGJ9QD847LAj2DTvMzqjaT2tJm"
);

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
      description: "Generate a BlinkPic from your X PFP",
      label: "Generate BlinkPic",
      links: {
        actions: [
          {
            label: "Enter your X username", // button text
            href: `${baseHref}&username={username}`, // this href will have a text input
            parameters: [
              {
                name: "username",
                label: "X Username",
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
    const { username, toPubkey } = validatedQueryParams(requestUrl);

    console.log("username", username);
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

    const url = await uploadMetadata(username, account.toBase58());

    console.log("url", url);

    const connection = new Connection(
      "https://mainnet.helius-rpc.com/?api-key=a0529e8a-e33f-4f66-95ad-b9036bc552e7"
    );

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
      priorityFee: 100,
      isMutable: true,
      receiver: account.toBase58(),
    });

    const decodedTxn = Transaction.from(
      Buffer.from(tx.encoded_transaction, "base64")
    );

    transaction.add(decodedTxn);

    transaction.feePayer = account;

    const latestBlock = await connection.getLatestBlockhash();

    transaction.recentBlockhash = latestBlock.blockhash;

    transaction.lastValidBlockHeight = latestBlock.lastValidBlockHeight;

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Minted BlinkPic for ${username}`,
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
  let username = "vrajdesai78";

  try {
    if (requestUrl.searchParams.get("to")) {
      toPubkey = new PublicKey(requestUrl.searchParams.get("to")!);
    }
    if (requestUrl.searchParams.get("username")) {
      username = `https://x.com/${requestUrl.searchParams.get(
        "username"
      )}/photo`;
    }
  } catch (err) {
    throw "Invalid input query parameter: to";
  }

  return {
    username,
    toPubkey,
  };
}
