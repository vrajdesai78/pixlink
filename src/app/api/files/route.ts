import { NextResponse, NextRequest } from "next/server";
import { Readable } from "node:stream";
import PinataClient from "@pinata/sdk";

const pinata = new PinataClient({ pinataJWTKey: process.env.PINATA_JWT });

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;
    const stream = Readable.fromWeb(file.stream() as any);
    const options = {
      pinataMetadata: {
        name: file.name,
      },
    };
    const { IpfsHash } = await pinata.pinJSONToIPFS(stream, options);

    return NextResponse.json({ IpfsHash }, { status: 200 });
  } catch (e) {
    console.log(e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
