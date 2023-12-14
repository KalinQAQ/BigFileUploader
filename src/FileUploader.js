import { InboxOutlined } from "@ant-design/icons";
import "./FileUploader.css";
import { useRef } from "react";
import useDrag from "./useDrag";
import { Button, message } from "antd";
import { CHUNK_SIZE } from "./constant";
import axiosInstance from "./axiosInstance";

function FileUploader() {
  const uploadContainerRef = useRef(null);
  const { selectedFile, filePreview } = useDrag(uploadContainerRef);
  const handleUpload = async () => {
    if (!selectedFile) {
      message.error("你尚未选择任何文件");
      return;
    }
    const filename = await getFileName(selectedFile);
    await uploadFile(selectedFile, filename);
  };
  const renderButton = () => {
    return <Button onClick={handleUpload}>上传</Button>;
  };
  return (
    <>
      <div className="upload-container" ref={uploadContainerRef}>
        {renderFilePrevire(filePreview)}
      </div>
      {renderButton()}
    </>
  );
}
/**
 *
 * @param {*} filename
 * @param {*} chunkFileName
 * @param {*} chunk
 */
function createRequest(filename, chunkFileName, chunk) {
  return axiosInstance.post(`/upload/${filename}`, chunk, {
    headers: {
      "Content-Type": "application/octet-stream",
    },
    params: {
      chunkFileName,
    },
  });
}
/**
 * 实现切片上传大文件
 * @param {*} file 大文件
 * @param {*} filename 文件名
 */
async function uploadFile(file, filename) {
  // 把大文件进行切片
  const chunks = createFileChunks(file, filename);
  // 实现并行上传
  const requests = chunks.map((chunk, chunkFileName) => {
    return createRequest(filename, chunkFileName, chunk);
  });
  try {
    // 并行上传每个分片
    await Promise.all(requests);
    // 等全部的分片上传完了，会向服务器发送一个合并文件的请求
    await axiosInstance.get(`/merge/${filename}`);
    message.success("文件上传完成");
  } catch (error) {
    console.log("上传出错", error);
    message.error("上传出错");
  }
}
function createFileChunks(file, filename) {
  let chunks = [];
  // 计算一共要切成多少片
  let count = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < count; i++) {
    let chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    chunks.push({
      chunk,
      chunkFileName: `${filename}-${i}`,
    });
  }
  return chunks;
}
/**
 * 根据文件对象获取文件内容得到的hash文件名
 * @param {*} file 文件对象
 */
async function getFileName(file) {
  // 计算此文件的hash值
  const fileHash = await calculateFileHash(file);
  // 获取文件扩展名
  const fileExtension = file.name.split(".").pop();
  return `${fileHash}.${fileExtension}`;
}
/**
 * 计算文件的hash字符串
 * @param {*} file 文件对象
 */
async function calculateFileHash(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return BufferToHex(hashBuffer);
}
/**
 * 把ArrayBuffer转成16进制的字符串
 * @param {*} buffer
 * @returns
 */
function BufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/**
 * 显示文件的预览信息
 * @param {*} filePreview
 */
function renderFilePrevire(filePreview) {
  const { url, type } = filePreview;
  if (url) {
    if (type.startsWith("video/")) {
      return <video src={url} controls />;
    } else if (type.startsWith("image/")) {
      return <img src={url} alt="preview" />;
    } else {
      return url;
    }
  } else {
    return <InboxOutlined />;
  }
}
export default FileUploader;
