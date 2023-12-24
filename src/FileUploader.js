import { InboxOutlined } from "@ant-design/icons";
import "./FileUploader.css";
import { useRef, useState } from "react";
import useDrag from "./useDrag";
import { Button, message, Progress } from "antd";
import { CHUNK_SIZE } from "./constant";
import axios from "axios";
import axiosInstance from "./axiosInstance";
const UploadStatus = {
  NOT_STARTED: "NOT_STARTED", // 初始状态，尚未开始上传
  UPLOADING: "UPLOADING", // 上传中
  PAUSED: "PAUSED", // 已暂停上传
};
function FileUploader() {
  const uploadContainerRef = useRef(null);
  const { selectedFile, filePreview, resetFileStatus } =
    useDrag(uploadContainerRef);
  // 控制上传的状态 初始态 上传中 已暂停
  let [uploadProgress, setUploadProgress] = useState({});
  const [uploadStatus, setUploadStatus] = useState(UploadStatus.NOT_STARTED);
  // 存放所有上传请求的取消token
  const [cancelTokens, setCancelTokens] = useState([]);

  function resetAllStatus() {
    resetFileStatus();
    setUploadProgress({});
    setUploadStatus(UploadStatus.NOT_STARTED);
  }
  const handleUpload = async () => {
    if (!selectedFile) {
      message.error("你尚未选择任何文件");
      return;
    }
    setUploadStatus(UploadStatus.UPLOADING);
    const filename = await getFileName(selectedFile);
    await uploadFile(
      selectedFile,
      filename,
      setUploadProgress,
      resetAllStatus,
      setCancelTokens
    );
  };
  const pauseUpload = async () => {
    setUploadStatus(UploadStatus.PAUSED);
    cancelTokens.forEach((cancelToken) =>
      cancelToken.cancel("用户主动暂停了上传")
    );
  };
  const renderButton = () => {
    switch (uploadStatus) {
      case UploadStatus.NOT_STARTED:
        return <Button onClick={handleUpload}>上传</Button>;
      case UploadStatus.UPLOADING:
        return <Button onClick={pauseUpload}>暂停</Button>;
      case UploadStatus.PAUSED:
        return <Button onClick={handleUpload}>恢复上传</Button>;
    }
  };
  const renderProgress = () => {
    if (uploadStatus !== UploadStatus.NOT_STARTED) {
      let totalProgress = renderTotalProgress();
      let chunkProgresses = Object.keys(uploadProgress).map(
        (chunkName, index) => (
          <div>
            <span>切片{index}:</span>
            <Progress percent={uploadProgress[chunkName]} />
          </div>
        )
      );
      return (
        <>
          {totalProgress}
          {chunkProgresses}
        </>
      );
    }
  };

  const renderTotalProgress = () => {
    const percents = Object.values(uploadProgress);
    if (percents.length > 0) {
      const totalPercent = Math.round(
        percents.reduce((acc, curr) => acc + curr, 0) / percents.length
      );
      return (
        <div>
          <span>总进度:</span>
          <Progress percent={totalPercent} />
        </div>
      );
    }
  };
  return (
    <>
      <div className="upload-container" ref={uploadContainerRef}>
        {renderFilePrevire(filePreview)}
      </div>
      {renderButton()}
      {renderProgress()}
    </>
  );
}
/**
 *
 * @param {*} filename
 * @param {*} chunkFileName
 * @param {*} chunk
 */
function createRequest(
  filename,
  chunkFileName,
  chunk,
  setUploadProgress,
  cancelToken,
  start
) {
  return axiosInstance.post(`/upload/${filename}`, chunk, {
    headers: {
      "Content-Type": "application/octet-stream",
    },
    params: {
      chunkFileName,
      start, // 把写入文件的其实位置作为查询参数发给服务器
    },

    // 上传进度发生变化的事件回调函数
    onUploadProgress: (ProgressEvent) => {
      // 用已经上传的字节数 / 总字节数 = 完成的百分比
      const percentCompleted = Math.round(
        (ProgressEvent.loaded * 100) / ProgressEvent.total
      );
      setUploadProgress((prevProgress) => ({
        ...prevProgress,
        [chunkFileName]: percentCompleted,
      }));
    },
    cancelToken: cancelToken.token,
  });
}
/**
 * 实现切片上传大文件
 * @param {*} file 大文件
 * @param {*} filename 文件名
 */
async function uploadFile(
  file,
  filename,
  setUploadProgress,
  resetAllStatus,
  setCancelTokens
) {
  const { needUpload, uploadedChunkList } = await axiosInstance.get(
    `/verify/${filename}`
  );
  if (!needUpload) {
    message.success(`文件已存在，秒传成功`);
    return resetAllStatus();
  }
  // 把大文件进行切片
  const chunks = createFileChunks(file, filename);
  const newCancelTokens = [];
  const newUploadProgress = {};
  // 实现并行上传
  const requests = chunks.map(({ chunk, chunkFileName }) => {
    const cancelToken = axios.CancelToken.source();
    newCancelTokens.push(cancelToken);
    newUploadProgress[chunkFileName] = 0;
    // 向服务器传送的数据可能就不再是完整的分片数据
    // 判断当前的分片是否是以及上传过服务器了
    const existingChunk = uploadedChunkList.find((uploadedChunk) => {
      return uploadedChunk.chunkFileName == chunkFileName;
    });
    // 已经上传过一部分/全部上传过了
    if (existingChunk) {
      // 获取已经上传的分片的大小
      const uploadedSize = existingChunk.size;
      // 从chunk中进行截取，
      const remainingChunk = chunk.slice(uploadedSize);
      // 如果剩下数据为0，说明完全上传完毕
      if (remainingChunk.size === 0) {
        return Promise.resolve();
      } else {
        // total:100字节，已经传60字节，写入文件的起始索引60
        return createRequest(
          filename,
          chunkFileName,
          remainingChunk,
          setUploadProgress,
          cancelToken,
          uploadedSize
        );
      }
    }
    return createRequest(
      filename,
      chunkFileName,
      chunk,
      setUploadProgress,
      cancelToken,
      0
    );
  });
  setCancelTokens(newCancelTokens);
  setUploadProgress(newUploadProgress);
  try {
    // 并行上传每个分片
    await Promise.all(requests);
    // 等全部的分片上传完了，会向服务器发送一个合并文件的请求
    await axiosInstance.get(`/merge/${filename}`);
    message.success("文件上传完成");
    resetAllStatus();
  } catch (error) {
    // 用户主动点击了暂停的按钮，暂停上传
    if (axios.isCancel(error)) {
      console.log("上传暂停", error);
      message.warning("上传暂停");
    }
    console.log("上传出错", error);
    message.error("上传出错");
  }
}
function createFileChunks(file, filename) {
  //最后切成的分片的数组
  let chunks = [];
  //计算一共要切成多少片
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
