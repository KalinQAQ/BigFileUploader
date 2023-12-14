import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "http://loaclhost:8080",
});

axiosInstance.interceptors.response.use(
  // response响应对象,data,headers
  // response.data.success为true表示成功,为false表示失败了
  (response) => {
    if (response.data && response.data.success) {
      return response.data; // 返回响应体，这也的话可以再代码直接获取响应体
    } else {
      throw new Error(response.data.message || "服务器端错误");
    }
  },
  (error) => {
    console.log("请求错误", error);
  }
);

export default axiosInstance;
